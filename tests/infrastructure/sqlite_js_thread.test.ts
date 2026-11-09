import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const connector = readFileSync(
  path.join(root, "sincpro_mobile/infrastructure/database/connector.ts"),
  "utf8",
);

test("SQLite is reached only through the functions that run on the JavaScript thread", () => {
  // expo-modules-jsi 58 encodes async results off the JavaScript thread on iOS and corrupts
  // Hermes (crash on logout). Every call goes through the sync native functions.
  assert.doesNotMatch(connector, /openDatabaseAsync/);
  assert.doesNotMatch(connector, /\bdb\.\w+Async\(/);
  assert.match(connector, /db\.runSync\(safeQuery, \.\.\.params\)/);
  assert.match(connector, /db\.execSync\("BEGIN;"\)/);
  assert.match(connector, /db\.execSync\("ROLLBACK;"\)/);
});
