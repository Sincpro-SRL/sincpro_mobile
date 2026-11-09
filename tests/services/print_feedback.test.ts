import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import type { TWebViewMessage } from "@sincpro/mobile/domain/webview";
import { routePrintMessage } from "@sincpro/mobile/domain/webview/print_cycle";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

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
