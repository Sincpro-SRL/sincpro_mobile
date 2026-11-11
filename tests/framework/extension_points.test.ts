import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";

import { runLifecycle } from "@sincpro/mobile/framework/lifecycle";
import { replaceable } from "@sincpro/mobile/framework/replaceable";
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
  const printer = read("sincpro_mobile/services/printer.service.ts");
  assert.match(printer, /export function setPrinterService\(service: PrinterService\)/);
  assert.match(printer, /get policy\(\): Readonly<PrinterOptions>/);
  assert.match(
    read("sincpro_mobile/framework/base_module.ts"),
    /!printerService\.policy\.autoReconnect\) return;/,
    "the core honours the app's policy",
  );
  assert.match(printer, /get driver\(\): IPrinterDriver/);
});

test("a replaced core component reaches every caller, getters included", () => {
  class Printer {
    name = "core";
    get label() {
      return `printer:${this.name}`;
    }
    print() {
      return this.name;
    }
  }
  class AppPrinter extends Printer {
    override name = "app";
    override print() {
      return `${super.print()}+audit`;
    }
  }
  const slot = replaceable(new Printer());
  const shared = slot.instance;
  assert.equal(shared.print(), "core");
  slot.set(new AppPrinter());
  assert.equal(shared.print(), "app+audit", "callers holding the instance see the swap");
  assert.equal(shared.label, "printer:app");
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
  const webview = read("sincpro_mobile/services/webview.service.ts");
  assert.doesNotMatch(webview, /validTypes/);
  assert.match(webview, /if \(typeof parsed\.type !== "string"\) return null;/);
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
