import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

import {
  BoundedContext,
  Command,
  configureProcess,
  Feature,
  loggerAdapter,
} from "@sincpro/client-framework";

import { PrinterUnavailable } from "../../sincpro_mobile/exceptions.ts";
import {
  configureLogger,
  mobileLogger,
  setDebugLogging,
} from "../../sincpro_mobile/infrastructure/logger.ts";

const ANSI = String.fromCharCode(27) + "[";

const COLOR = new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, "g");

/** The line as a person reads it in the Metro terminal, colors aside. */
const read = (line: unknown) => String(line).replace(COLOR, "");

class CommandPrint extends Command<string> {
  constructor(readonly how: "print" | "off" | "break") {
    super();
  }
}

function printing(): BoundedContext {
  const shopBoundedContext = new BoundedContext("shop");
  shopBoundedContext.feature(CommandPrint)(
    class PrintImage extends Feature<CommandPrint, string> {
      execute(command: CommandPrint): string {
        if (command.how === "off") throw new PrinterUnavailable("printer is off");
        if (command.how === "break") throw new TypeError("printer is undefined");
        this.logger.info("Printing", { page: 2, title: "Ticket 7" });
        return "printed";
      }
    },
  );
  return shopBoundedContext.expectErrors(PrinterUnavailable);
}

let calls: Record<"debug" | "log" | "warn" | "error", ReturnType<typeof mock.method>>;

beforeEach(() => {
  calls = {
    debug: mock.method(console, "debug", () => {}),
    log: mock.method(console, "log", () => {}),
    warn: mock.method(console, "warn", () => {}),
    error: mock.method(console, "error", () => {}),
  };
  configureLogger({ mode: "development", production: {}, debug: {} });
  setDebugLogging(true);
  configureProcess({ logger: { engine: mobileLogger } });
});

afterEach(() => {
  mock.restoreAll();
  setDebugLogging(false);
  configureProcess();
});

test("a print reads as a few clean lines: ▶, what it wrote, ✔ with its time — one argument each", async () => {
  await printing().execute(new CommandPrint("print"));

  const lines = [...calls.debug.mock.calls, ...calls.log.mock.calls].map(
    (call) => call.arguments,
  );
  const text = lines.map(([line]) => read(line));

  assert.ok(
    text.some((line) => /DEBUG \[feature\] ▶ shop\.PrintImage #[0-9a-f]{6}$/.test(line)),
  );
  assert.ok(
    text.some((line) =>
      /INFO {2}\[feature\] shop\.PrintImage Printing page=2 title="Ticket 7" #/.test(line),
    ),
  );
  assert.ok(text.some((line) => /INFO {2}\[feature\] ✔ shop\.PrintImage \d+ms #/.test(line)));
  assert.ok(
    lines.every((args) => args.length === 1),
    "the record is never dumped after a line",
  );
});

test("a printer off is one info line with its kind; an unexpected failure brings its Error", async () => {
  await printing()
    .execute(new CommandPrint("off"))
    .catch(() => undefined);
  await printing()
    .execute(new CommandPrint("break"))
    .catch(() => undefined);

  const refused = calls.log.mock.calls.map((call) => read(call.arguments[0]));
  const [failed, shown] = calls.error.mock.calls.at(-1)?.arguments ?? [];

  assert.ok(
    refused.some((line) => /✖ shop\.PrintImage refused: unavailable \d+ms/.test(line)),
  );
  assert.match(
    String(failed),
    /ERROR \[feature\] ✖ shop\.PrintImage TypeError: printer is undefined/,
  );
  assert.ok(shown instanceof Error, "LogBox and Expo show its code frame");
});

test("DEBUG and INFO are colored for Metro's terminal; WARN and ERROR stay plain for LogBox", () => {
  loggerAdapter.info("Synced", { rows: 3 });
  loggerAdapter.warn("Slow sync", { ms: 900 });
  loggerAdapter.error("Sync failed");

  assert.ok(String(calls.log.mock.calls[0]?.arguments[0]).includes(ANSI));
  assert.ok(!String(calls.warn.mock.calls[0]?.arguments[0]).includes(ANSI));
  assert.ok(!String(calls.error.mock.calls[0]?.arguments[0]).includes(ANSI));
  assert.match(
    String(calls.warn.mock.calls[0]?.arguments[0]),
    /WARN {2}\[adapter\] Slow sync ms=900$/,
  );
});
