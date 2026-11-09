import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import type { TWebViewMessage } from "@sincpro/mobile/domain/webview";
import {
  printNoticeKey,
  routePrintMessage,
} from "@sincpro/mobile/domain/webview/print_cycle";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

test("every step of a page print carries its job id to the handlers", async () => {
  const jobs: (string | undefined)[] = [];
  const handlers = {
    started: (_title: string, jobId?: string) => void jobs.push(jobId),
    failed: (_title: string, _reason: string, jobId?: string) => void jobs.push(jobId),
    image: async (input: { jobId?: string }) => void jobs.push(input.jobId),
  };
  const route = (msg: object) => routePrintMessage(msg as TWebViewMessage, handlers);

  await route({ type: "PRINT_STARTED", title: "Ticket 7", jobId: "print-1" });
  await route({
    type: "PRINT_IMAGE",
    image: "abc",
    width: 1,
    height: 2,
    jobId: "print-1",
    metadata: { title: "Ticket 7" },
  });
  await route({ type: "PRINT_FAILED", title: "Ticket 8", reason: "x", jobId: "print-2" });

  assert.deepEqual(jobs, ["print-1", "print-1", "print-2"]);
  assert.equal(printNoticeKey("print-1"), "print:print-1");
});

test("the interceptor sends one job id in the start, the image and the failure", () => {
  const adapter = read("sincpro_mobile/adapters/webview.adapter.ts");
  const print = adapter.slice(adapter.indexOf("window.print = function"));
  assert.match(print, /var jobId = /);
  assert.equal(print.match(/jobId: jobId/g)?.length, 3);
});

test("a print is one notice that changes: preparing, printing, then printed or the reason", () => {
  const service = read("sincpro_mobile/services/printer.service.ts");
  const started = service.slice(service.indexOf("reportPrintStarted(title"));
  assert.match(started, /key: printNoticeKey\(jobId\)[\s\S]*?variant: "loading"/);
  assert.match(started, /setTimeout\([\s\S]*?this\.reportPrintFailed\(/);
  assert.match(
    service.slice(service.indexOf("reportPrintFailed(title")),
    /this\.settleCapture\(jobId\);[\s\S]*?key: printNoticeKey\(jobId\)/,
  );
  assert.match(
    service.slice(service.indexOf("async enqueuePrintImage(")),
    /this\.settleCapture\(jobId\);[\s\S]*?jobId,\s*\}\);/,
  );

  const subscriber = read("sincpro_mobile/entrypoints/queue/printImage.subscriber.ts");
  assert.match(subscriber, /const key = printNoticeKey\(event\.jobId \|\| event\.uuid\);/);
  const notices = subscriber.match(/notifyDevice\(\{\s*key,/g) ?? [];
  assert.equal(notices.length, 4);
  assert.match(subscriber, /title: "Imprimiendo",[\s\S]*?variant: "loading"/);

  const deviceNotices = read("sincpro_mobile/ui/activity/DeviceNotices.tsx");
  assert.equal(deviceNotices.match(/id: notice\.key,/g)?.length, 2);
  assert.match(deviceNotices, /render: undefined,/);
});

test("the page's print cycle reaches the user: started, image and failure", async () => {
  const calls: string[] = [];
  const handlers = {
    started: (title: string) => void calls.push(`started:${title}`),
    failed: (title: string, reason: string) => void calls.push(`failed:${title}:${reason}`),
    image: async (input: { title: string }) => void calls.push(`image:${input.title}`),
  };
  const route = (msg: object) => routePrintMessage(msg as TWebViewMessage, handlers);

  assert.equal(await route({ type: "PRINT_STARTED", title: "Ticket 7" }), true);
  await route({
    type: "PRINT_FAILED",
    title: "Ticket 7",
    reason: "Failed to load html2canvas",
  });
  await route({
    type: "PRINT_IMAGE",
    image: "abc",
    width: 1,
    height: 2,
    metadata: { title: "Ticket 7" },
  });
  assert.equal(await route({ type: "PRINT_IMAGE", image: "", width: 1, height: 2 }), false);
  assert.equal(await routePrintMessage(null, handlers), false);

  assert.deepEqual(calls, [
    "started:Ticket 7",
    "failed:Ticket 7:Failed to load html2canvas",
    "image:Ticket 7",
  ]);
});

test("the interceptor reports start and failure instead of a silent native print()", () => {
  const adapter = read("sincpro_mobile/adapters/webview.adapter.ts");
  assert.match(adapter, /EWebViewMessageType\.PRINT_STARTED/);
  assert.match(adapter, /EWebViewMessageType\.PRINT_FAILED/);
  assert.doesNotMatch(adapter, /originalPrint/);
});

test("a failed print offers both the failed list and the printer", () => {
  const notices = read("sincpro_mobile/ui/activity/DeviceNotices.tsx");
  // The host frames the toast; a second Toast.Root drew a toast inside the toast.
  assert.doesNotMatch(notices, /<Toast\.Root>/);
  assert.match(notices, /actions\.map\(\(action\) =>/);
  assert.match(notices, /onAction\?\.\(action\.intent\)/);
  assert.match(
    read("sincpro_mobile/entrypoints/ui/AppShell.tsx"),
    /<DeviceNotices onAction=\{config\.onNoticeAction\} \/>/,
  );
  const subscriber = read("sincpro_mobile/entrypoints/queue/printImage.subscriber.ts");
  const failure = subscriber.slice(subscriber.indexOf('name: "printer.print_failed"'));
  assert.ok(
    failure.indexOf("actions: printerService.printFailureActions()") <
      failure.indexOf("throw new"),
  );
  assert.match(subscriber, /name: "printer\.printed"/);
  const service = read("sincpro_mobile/services/printer.service.ts");
  assert.match(service, /failed: \{ label: "Ver fallidas", intent: "failed-prints" \}/);
  assert.match(service, /printer: \{ label: "Impresora", intent: "printer" \}/);
});
