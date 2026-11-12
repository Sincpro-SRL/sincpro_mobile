import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

import { configureProcess } from "@sincpro/client-framework";
import { type MemoryReporter, memoryReporter } from "@sincpro/client-framework/testing";

import type { Notice } from "../../sincpro_mobile/domain/notifier.ts";
import { DomainException } from "../../sincpro_mobile/exceptions.ts";
import type { CommonDependencies } from "../../sincpro_mobile/infrastructure/dependencies.ts";
import { lokiLine } from "../../sincpro_mobile/infrastructure/logger.ts";
import {
  componentOf,
  crashRecord,
  tellCrash,
  viewOf,
} from "../../sincpro_mobile/infrastructure/ui/crash.ts";
import {
  FATAL_DELIVERY_MS,
  type GlobalErrorHandler,
  globalErrorHandler,
} from "../../sincpro_mobile/infrastructure/ui/errorHandler.ts";
import {
  CommandSendErrorReport,
  commonBoundedContext,
} from "../../sincpro_mobile/services/index.ts";

const COMPONENT_STACK = `
    in TicketScreen (created by Route)
    in Route (created by Stack)
    in RCTView`;

/** What a broken screen throws: an error with the bundle's stack. */
function broken(message = "Cannot read property 'child' of undefined"): TypeError {
  const error = new TypeError(message);
  error.stack = `TypeError: ${message}\n    at TicketScreen (index.android.bundle:1:23456)`;
  return error;
}

let reporter: MemoryReporter;
let notices: Notice[];
let restores: (() => void)[];

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

beforeEach(() => {
  reporter = memoryReporter();
  configureProcess({ reporter, identity: { release: "sincpro-mobile-tickets:3.0.0" } });
  notices = [];
  restores = [];
  swap("notifier", { notify: (notice: Notice) => void notices.push(notice) });
});

afterEach(() => {
  for (const restore of restores.reverse()) restore();
});

test("the screen that broke is read from React's component stack, in both of its formats", () => {
  assert.equal(componentOf(COMPONENT_STACK), "TicketScreen");
  assert.equal(
    componentOf("\n    at TicketScreen (http://x/index.bundle:9:3)\n"),
    "TicketScreen",
  );
  assert.equal(viewOf(COMPONENT_STACK), "view TicketScreen");
  assert.equal(viewOf(undefined), "view unknown");
});

test("a screen's failure is one ERROR line in Loki: the release, then its stack and the component stack", () => {
  const line = lokiLine(crashRecord(broken(), "view TicketScreen", COMPONENT_STACK));
  const [first, ...stack] = line.split("\n");

  assert.match(
    first,
    /^\[infrastructure\] Unexpected failure in view TicketScreen where="?view TicketScreen/,
  );
  assert.match(first, /release=sincpro-mobile-tickets:3\.0\.0/);
  assert.match(first, /error_type=TypeError/);
  assert.match(stack.join("\n"), /at TicketScreen \(index\.android\.bundle:1:23456\)/);
  assert.match(stack.join("\n"), /Component stack:\nin TicketScreen \(created by Route\)/);
});

test("a screen's failure is reported once, where it broke, with its component stack as the cause", () => {
  const error = broken();

  tellCrash(error, "view TicketScreen", COMPONENT_STACK);
  tellCrash(error, "view TicketScreen", COMPONENT_STACK);

  assert.equal(reporter.reports.length, 1);
  assert.equal(reporter.reports[0]?.about.useCase, "view TicketScreen");
  const cause = error.cause as Error;
  assert.equal(cause.name, "React ErrorBoundary TypeError");
  assert.equal(cause.stack, COMPONENT_STACK);
});

test("the global handler writes the line and hands over; the error client after it reports", () => {
  const handed: unknown[] = [];
  const handler = globalErrorHandler(
    (error) => void handed.push(error),
    async () => undefined,
    () => assert.fail("not a business answer"),
  );
  const error = broken();

  handler(error, false);

  assert.deepEqual(handed, [error], "a non-fatal error goes on at once");
  assert.equal(reporter.reports.length, 0, "Sentry's own handler reports it, not twice");
});

test("a fatal error waits for its line to leave before the app closes", async () => {
  let delivered!: () => void;
  const handed: unknown[] = [];
  const handler: GlobalErrorHandler = globalErrorHandler(
    (error) => void handed.push(error),
    () => new Promise<void>((resolve) => (delivered = resolve)),
    () => undefined,
  );

  handler(broken(), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(handed.length, 0, "the app is not closed while the line leaves");

  delivered();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(handed.length, 1);
});

test("a fatal error does not wait for a network that never answers", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const handed: unknown[] = [];
    const handler = globalErrorHandler(
      (error) => void handed.push(error),
      () => new Promise(() => undefined),
      () => undefined,
    );

    handler(broken(), true);
    mock.timers.tick(FATAL_DELIVERY_MS);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(handed.length, 1);
  } finally {
    mock.timers.reset();
  }
});

test("a business answer that reached the top is explained to the person, not reported", () => {
  const explained: DomainException[] = [];
  const handed: unknown[] = [];
  const handler = globalErrorHandler(
    (error) => void handed.push(error),
    async () => undefined,
    (error) => void explained.push(error),
  );

  handler(new DomainException("La caja está cerrada"), false);

  assert.equal(explained[0]?.message, "La caja está cerrada");
  assert.deepEqual(handed, []);
  assert.equal(reporter.reports.length, 0);
});

test("«Enviar reporte» sends what was logged now and says whether it left", async () => {
  for (const waiting of [0, 3, null]) {
    swap("telemetry", { deliverNow: async () => waiting });
    assert.equal(await commonBoundedContext.execute(new CommandSendErrorReport()), waiting);
  }

  assert.deepEqual(
    notices.map((notice) => notice.name),
    ["report.sent", "report.waiting", "report.unavailable"],
  );
});
