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

test("the AppShell keeps the saved printer connected only for hosts that print", () => {
  const shell = read("sincpro_mobile/entrypoints/ui/AppShell.tsx");
  assert.match(shell, /if \(status !== "ready" \|\| !hasPrinterDriver\(\)\) return;/);
  assert.match(shell, /return printerService\.keepConnected\(\);/);
});
