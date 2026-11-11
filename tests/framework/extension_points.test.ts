import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";

import { runLifecycle } from "@sincpro/mobile/framework/lifecycle";
import {
  clearWebViewHandlers,
  dispatchWebViewMessage,
  registerWebViewHandler,
} from "@sincpro/mobile/infrastructure/webview/message_handlers";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

afterEach(() => clearWebViewHandlers());

test("the core wires the extension points instead of concrete behavior", () => {
  assert.match(
    read("sincpro_mobile/framework/createApp.ts"),
    /kernel\.registerExtensions\(\);/,
  );
  const printer = read("sincpro_mobile/adapters/Printer.adapter.ts");
  assert.match(printer, /export const printerAdapter = new PrinterAdapter\(\);/);
  assert.match(printer, /get policy\(\): Readonly<PrinterOptions>/);
  assert.match(
    read("sincpro_mobile/framework/base_module.ts"),
    /const printer = commonBoundedContext\.deps\.printer;\s*if \(!hasPrinterDriver\(\) \|\| !printer\.policy\.autoReconnect\) return;/,
    "the core honours the policy of the printer the bounded context holds",
  );
  assert.match(printer, /get driver\(\): IPrinterDriver/);
});

test("an app's printer takes the core's place for every use case", async () => {
  const { commonBoundedContext, CommandRestorePrinterConnection } =
    await import("@sincpro/mobile/services");
  const { PrinterAdapter, printerAdapter } =
    await import("@sincpro/mobile/adapters/Printer.adapter");
  const calls: string[] = [];
  class AppPrinter extends PrinterAdapter {
    override async restoreConnection(): Promise<void> {
      calls.push("app");
    }
  }
  const mine = new AppPrinter();
  commonBoundedContext.addDependency("printer", mine, { replaces: printerAdapter });
  try {
    await commonBoundedContext.execute(new CommandRestorePrinterConnection());
    assert.deepEqual(calls, ["app"]);
  } finally {
    commonBoundedContext.addDependency("printer", printerAdapter, { replaces: mine });
  }
});

test("lifecycle hooks run in order and one failure never stops the others", async () => {
  const calls: string[] = [];
  const errors: string[] = [];
  const module = (key: string, fail = false) => ({
    key,
    onStart: async () => {
      if (fail) throw new Error("boom");
      calls.push(key);
    },
    onForeground: () => {},
    onLogin: () => {},
    onLogout: () => {},
  });
  await runLifecycle(
    [module("BASE"), module("ODOO", true), module("APP")],
    "onStart",
    (key) => errors.push(key),
  );
  assert.deepEqual(calls, ["BASE", "APP"]);
  assert.deepEqual(errors, ["ODOO"]);
});

test("WebView messages reach the handler of their type; an app's handler wins", async () => {
  const seen: string[] = [];
  registerWebViewHandler("PRINT_IMAGE", () => void seen.push("core"));
  registerWebViewHandler("PRINT_IMAGE", () => void seen.push("app"));
  registerWebViewHandler(
    "ORDER_SCANNED",
    (message) => void seen.push(`order:${message.code}`),
  );

  assert.equal(await dispatchWebViewMessage(JSON.stringify({ type: "PRINT_IMAGE" })), true);
  await dispatchWebViewMessage(JSON.stringify({ type: "ORDER_SCANNED", code: "A1" }));
  assert.equal(await dispatchWebViewMessage(JSON.stringify({ type: "UNKNOWN" })), false);
  assert.equal(await dispatchWebViewMessage("not json"), false);
  assert.deepEqual(seen, ["app", "order:A1"]);
  clearWebViewHandlers();
});

test("the core passes data raw and lets the app configure it", () => {
  // No allow-lists: an app's own WebView message types reach its handlers.
  const webview = read("sincpro_mobile/domain/webview/messages.ts");
  assert.doesNotMatch(webview, /validTypes/);
  assert.match(webview, /if \(!parsed \|\| typeof parsed\.type !== "string"\) return null;/);
  // Any react-native-webview prop reaches the WebView, after the defaults.
  const injectable = read("sincpro_mobile/ui/components/organisms/InjectableWebView.tsx");
  assert.match(
    injectable,
    /style=\{\{ flex: 1, backgroundColor \}\}\s*\{\.\.\.webViewProps\}\s*\/>/,
  );
  // Console policy and event retention are the app's to set.
  assert.match(
    read("sincpro_mobile/infrastructure/logger.ts"),
    /export function configureLogger\(/,
  );
  assert.match(
    read("sincpro_mobile/entrypoints/ui/AppShell.tsx"),
    /eventRetentionDays: config\.eventRetentionDays/,
  );
});
