import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  configureProcess,
  type DomainEvent,
  type Envelope,
  failureOf,
  Publisher,
} from "@sincpro/client-framework";
import {
  memoryLogger,
  type MemoryReporter,
  memoryReporter,
  type MemoryTracer,
  memoryTracer,
} from "@sincpro/client-framework/testing";

import type { Notice, Notifier } from "../../sincpro_mobile/domain/notifier.ts";
import { PrintImageRequestedEvent } from "../../sincpro_mobile/domain/print/events.ts";
import { printCycleHandlers } from "../../sincpro_mobile/entrypoints/webview/print_cycle.ts";
import {
  BluetoothPermissionDenied,
  PrinterNotSelected,
  PrinterUnavailable,
} from "../../sincpro_mobile/exceptions.ts";
import type { CommonDependencies } from "../../sincpro_mobile/infrastructure/dependencies.ts";
import { PagePrintWatch } from "../../sincpro_mobile/infrastructure/webview/page_print_watch.ts";
import {
  CommandConnectPrinter,
  CommandPrinterStatus,
  CommandPrintTestPage,
  CommandProcessWebViewMessage,
  CommandRequestBluetoothPermission,
  CommandRestorePrinterConnection,
  CommandRetryEvents,
  commonBoundedContext,
} from "../../sincpro_mobile/services/index.ts";

let tracer: MemoryTracer;
let reporter: MemoryReporter;
let notices: Notice[];
let restores: (() => void)[];

/** Puts a test's value in place of a core dependency until the test ends. */
function swap<K extends keyof CommonDependencies>(name: K, fake: object): void {
  const current = commonBoundedContext.deps[name];
  commonBoundedContext.addDependency(name, fake as CommonDependencies[K], {
    replaces: current,
  });
  restores.push(() =>
    commonBoundedContext.addDependency(name, current, {
      replaces: fake as CommonDependencies[K],
    }),
  );
}

const spanOf = (useCase: string) => tracer.spans.find((span) => span.name === useCase);

beforeEach(() => {
  tracer = memoryTracer();
  reporter = memoryReporter();
  configureProcess({ tracer, reporter, logger: { engine: memoryLogger() } });
  notices = [];
  restores = [];
  const notifier: Notifier = { notify: (notice) => void notices.push(notice) };
  swap("notifier", notifier);
});

afterEach(() => {
  for (const restore of restores.reverse()) restore();
});

test("a printer that does not answer: the person is told, the run is refused and not reported", async () => {
  swap("printer", {
    connect: () => Promise.reject(new PrinterUnavailable("did not answer")),
  });

  const error = await commonBoundedContext
    .execute(new CommandConnectPrinter("AA:BB", "Caja 1"))
    .catch((caught: unknown) => caught);

  assert.equal(failureOf(error).kind, "unavailable");
  assert.deepEqual(
    notices.map((notice) => notice.name),
    ["printer.connect_failed"],
  );
  const span = spanOf("common/ConnectPrinter");
  assert.equal(span?.outcome, "refused");
  assert.equal(span?.attributes["printer.name"], "Caja 1");
  assert.equal(reporter.reports.length, 0, "a device answering is not a fault");
});

test("Bluetooth not granted is permission_denied, told as such, never reported", async () => {
  swap("printer", {
    connect: () => Promise.reject(new BluetoothPermissionDenied("not granted")),
  });

  const error = await commonBoundedContext
    .execute(new CommandConnectPrinter("AA:BB", "Caja 1"))
    .catch((caught: unknown) => caught);

  assert.equal(failureOf(error).kind, "permission_denied");
  assert.deepEqual(
    notices.map((notice) => notice.name),
    ["bluetooth.required"],
  );
  assert.equal(reporter.reports.length, 0);
});

test("a test page without a printer says why, keeps the kind, and its span says refused", async () => {
  swap("printer", {
    printTestPage: () => Promise.reject(new PrinterNotSelected("none")),
  });

  const error = await commonBoundedContext
    .execute(new CommandPrintTestPage())
    .catch((caught: unknown) => caught);

  assert.equal(failureOf(error).kind, "domain");
  assert.equal(notices[0]?.message, "Selecciona una impresora primero.");
  assert.equal(spanOf("common/PrintTestPage")?.outcome, "refused");
  assert.equal(reporter.reports.length, 0);
});

test("an unexpected failure of the printer adapter is a fault: the run fails and is reported", async () => {
  swap("printer", {
    printTestPage: () => Promise.reject(new TypeError("driver bug")),
  });

  await assert.rejects(commonBoundedContext.execute(new CommandPrintTestPage()), TypeError);

  assert.equal(spanOf("common/PrintTestPage")?.outcome, "failed");
  assert.equal(reporter.reports.length, 1);
});

test("the printer settings read their status through a use case, traced", async () => {
  swap("bluetooth", { hasPermissions: async () => ({ isGranted: true }) });
  swap("printer", {
    getSelectedPrinter: async () => ({ name: "Caja 1", address: "AA:BB", selectedAt: "" }),
    isConnected: () => false,
  });

  const status = await commonBoundedContext.execute(new CommandPrinterStatus());

  assert.deepEqual(status, {
    bluetoothGranted: true,
    selected: { name: "Caja 1", address: "AA:BB", selectedAt: "" },
    connected: false,
  });
  assert.equal(spanOf("common/ReadPrinterStatus")?.attributes["printer.connected"], false);
});

test("a denied Bluetooth permission is the person's answer: told, answered, not a failure", async () => {
  swap("bluetooth", { requestPermissions: async () => ({ isGranted: false }) });

  const permissions = await commonBoundedContext.execute(
    new CommandRequestBluetoothPermission(),
  );

  assert.equal(permissions.isGranted, false);
  assert.deepEqual(
    notices.map((notice) => notice.name),
    ["bluetooth.denied"],
  );
  const span = spanOf("common/RequestBluetoothPermission");
  assert.equal(span?.outcome, "ok");
  assert.equal(span?.attributes["bluetooth.granted"], false);
});

test("each reconnection try is a run; a printer that stays off is refused, never reported", async () => {
  swap("printer", {
    restoreConnection: () => Promise.reject(new PrinterUnavailable("off")),
  });

  await assert.rejects(
    commonBoundedContext.execute(new CommandRestorePrinterConnection()),
    PrinterUnavailable,
  );

  assert.equal(spanOf("common/RestorePrinterConnection")?.outcome, "refused");
  assert.equal(reporter.reports.length, 0);
});

test("the screens' event operations are use cases with their spans", async () => {
  const drained: string[] = [];
  swap("eventStore", { retry: async (ids: readonly string[]) => ids.length - 1 });
  swap("eventDelivery", { drain: async () => void drained.push("drain") });

  const moved = await commonBoundedContext.execute(
    new CommandRetryEvents([{ id: "a" }, { id: "b" }] as never),
  );

  assert.equal(moved, 1);
  const span = spanOf("common/RetryEvents");
  assert.equal(span?.attributes["events.asked"], 2);
  assert.equal(span?.attributes["events.retried"], 1);
  assert.deepEqual(drained, ["drain"], "what went back is delivered");
});

/** A queue that keeps what it was given: the event and the envelope the run wrote. */
function keptQueue() {
  const kept: { event: DomainEvent; envelope: Envelope }[] = [];
  return {
    kept,
    queue: {
      put: async (event: DomainEvent, envelope: Envelope) =>
        void kept.push({ event, envelope }),
      drain: async () => undefined,
    },
  };
}

test("a page's print image is queued by a child run, in the same trace and flow", async () => {
  const { kept, queue } = keptQueue();
  swap("publisher", new Publisher(queue as never));
  const raw = JSON.stringify({
    type: "PRINT_IMAGE",
    image: "abc",
    width: 1,
    height: 2,
    jobId: "job-1",
    metadata: { title: "Ticket 7" },
  });

  await commonBoundedContext.execute(new CommandProcessWebViewMessage(raw));

  const parent = spanOf("common/ProcessWebViewMessage");
  const child = spanOf("common/QueuePrint");
  assert.ok(parent && child);
  assert.equal(child.parentSpanId, parent.spanId, "the queueing is a child of the message");
  assert.equal(child.traceId, parent.traceId);
  const [stored] = kept;
  assert.ok(stored?.event instanceof PrintImageRequestedEvent);
  assert.equal((stored.event as PrintImageRequestedEvent).jobId, "job-1");
  assert.ok(stored.envelope.correlationId, "the event continues the run's flow");
});

test("a page's print cycle executes Commands, and a capture that never answers fails on time", async () => {
  const { kept, queue } = keptQueue();
  swap("publisher", new Publisher(queue as never));
  const watch = new PagePrintWatch(5);
  const handlers = printCycleHandlers(watch);
  const post = (message: object) =>
    handlers[(message as { type: string }).type]!(message as never);

  await post({ type: "PRINT_STARTED", title: "Ticket 7" });
  assert.ok(watch.isWatching("page"), "a page without a job id is still followed");
  await post({ type: "PRINT_IMAGE", image: "abc", width: 1, height: 2, metadata: {} });
  assert.equal(watch.isWatching("page"), false, "its image settles it");
  assert.equal(kept.length, 1);

  await post({ type: "PRINT_STARTED", title: "Ticket 8", jobId: "job-2" });
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.deepEqual(
    notices.map((notice) => `${notice.key}:${notice.name}`),
    [
      "print:page:printer.preparing",
      "print:job-2:printer.preparing",
      "print:job-2:printer.capture_failed",
    ],
  );
  assert.ok(spanOf("common/StartPagePrint"));
  assert.equal(spanOf("common/QueuePrint")?.outcome, "ok");
  assert.equal(
    spanOf("common/FailPagePrint")?.attributes["print.failure"],
    "the capture did not answer",
  );
});
