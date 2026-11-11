import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

test("logging out keeps the device settings", () => {
  // restartDatabase() drops every table a module does not persist. Settings hold the printer,
  // theme, time zone, debug mode and logger switches: they belong to the device, not the session.
  const base = read("sincpro_mobile/framework/base_module.ts");
  const persisted = base.slice(base.indexOf("persistOnReset"));
  assert.match(persisted, /DATABASE_TABLES\.SETTINGS/);
});

test("the saved printer stays connected through a core hook, not the AppShell", () => {
  const base = read("sincpro_mobile/framework/base_module.ts");
  const onStart = base.slice(base.indexOf("override onStart(): void {"));
  assert.match(
    onStart,
    /if \(!hasPrinterDriver\(\) \|\| !printer\.policy\.autoReconnect\) return;/,
  );
  assert.match(
    onStart,
    /keepPrinterConnected\([\s\S]*?commonBoundedContext\.execute\(new CommandRestorePrinterConnection\(\)\)/,
    "each try is a run of the core's bounded context",
  );
  const shell = read("sincpro_mobile/entrypoints/ui/AppShell.tsx");
  assert.doesNotMatch(shell, /printerAdapter|hasPrinterDriver/);
});
