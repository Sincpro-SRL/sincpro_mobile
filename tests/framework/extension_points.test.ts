import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";

import type { IntegrationEvent } from "@sincpro/mobile/domain/events";
import { runLifecycle } from "@sincpro/mobile/framework/lifecycle";
import { replaceable } from "@sincpro/mobile/framework/replaceable";
import { withoutReplaced } from "@sincpro/mobile/framework/replaces";
import {
  clearWebViewHandlers,
  dispatchWebViewMessage,
  registerWebViewHandler,
} from "@sincpro/mobile/infrastructure/webview/message_handlers";
import {
  ANY_EVENT,
  clearEventInterceptors,
  interceptEvent,
  runIntercepted,
} from "@sincpro/mobile/infrastructure/workers/interceptors";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const event = (name: string) => ({ name }) as IntegrationEvent;

afterEach(() => clearEventInterceptors());

test("interceptors wrap a subscriber from outside, the generic ones outermost", async () => {
  const calls: string[] = [];
  interceptEvent("print.requested", async (_event, next) => {
    calls.push("named:before");
    await next();
    calls.push("named:after");
  });
  interceptEvent(ANY_EVENT, async (_event, next, { subscriber }) => {
    calls.push(`any:before:${subscriber}`);
    await next();
    calls.push("any:after");
  });

  await runIntercepted(event("print.requested"), "PrintImageSubscriber", async () => {
    calls.push("subscriber");
  });

  assert.deepEqual(calls, [
    "any:before:PrintImageSubscriber",
    "named:before",
    "subscriber",
    "named:after",
    "any:after",
  ]);
});

test("an interceptor can veto the work or observe its failure", async () => {
  let ran = false;
  const remove = interceptEvent("print.requested", async () => {});
  await runIntercepted(event("print.requested"), "S", async () => {
    ran = true;
  });
  assert.equal(ran, false, "not calling next vetoes the subscriber");
  remove();

  let seen = "";
  interceptEvent("print.requested", async (_event, next) => {
    try {
      await next();
    } catch (error) {
      seen = (error as Error).message;
      throw error;
    }
  });
  await assert.rejects(
    runIntercepted(event("print.requested"), "S", async () => {
      throw new Error("printer off");
    }),
    /printer off/,
  );
  assert.equal(seen, "printer off");
});

test("events without interceptors run their subscriber as before", async () => {
  let ran = false;
  await runIntercepted(event("other"), "S", async () => {
    ran = true;
  });
  assert.equal(ran, true);
});

test("an app subscriber that replaces a core one stops the core one", () => {
  class CoreSubscriber {}
  class AppSubscriber {
    static replaces = CoreSubscriber;
  }
  class Unrelated {}
  const result = withoutReplaced({
    BASE: [new CoreSubscriber(), new Unrelated()],
    APP: [new AppSubscriber()],
  });
  assert.deepEqual(
    result.BASE.map((item) => item.constructor),
    [Unrelated],
  );
  assert.deepEqual(
    result.APP.map((item) => item.constructor),
    [AppSubscriber],
  );
});

test("the core wires the extension points instead of concrete behavior", () => {
  assert.match(
    read("sincpro_mobile/infrastructure/workers/EventBus.ts"),
    /runIntercepted\(event, subscriber\.constructor\.name, \(\) =>/,
  );
  assert.match(read("sincpro_mobile/framework/kernel.ts"), /return withoutReplaced\(map\);/);
  assert.match(
    read("sincpro_mobile/framework/createApp.ts"),
    /kernel\.registerExtensions\(\);/,
  );
  const printer = read("sincpro_mobile/services/printer.service.ts");
  assert.match(printer, /export function setPrinterService\(service: PrinterService\)/);
  assert.match(printer, /if \(!this\.options\.autoReconnect\) return \(\) => \{\};/);
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

test("an event nobody consumes is acknowledged, never a failure", () => {
  const bus = read("sincpro_mobile/infrastructure/workers/EventBus.ts");
  assert.doesNotMatch(bus, /postProcess\([a-z]+, \["No subscribers registered"\]\)/);
  assert.match(bus, /await this\.postProcess\(event, \[\]\);/);
  assert.match(bus, /await this\.postProcess\(current, \[\]\);/);
});
