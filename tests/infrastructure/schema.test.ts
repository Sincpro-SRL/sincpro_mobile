import assert from "node:assert/strict";
import test from "node:test";

import { addColumnStatement } from "../../sincpro_mobile/infrastructure/database/schema.ts";

test("an added column is an identifier and a fixed definition", () => {
  assert.equal(
    addColumnStatement("distribution_customers", "version", "INTEGER NOT NULL DEFAULT 1"),
    "ALTER TABLE distribution_customers ADD COLUMN version INTEGER NOT NULL DEFAULT 1",
  );
  assert.throws(() => addColumnStatement("customers", "version;drop", "INTEGER"));
  assert.throws(() => addColumnStatement("customers", "version", "INTEGER; DROP TABLE t"));
});
