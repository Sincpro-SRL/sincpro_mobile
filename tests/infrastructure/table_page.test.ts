import assert from "node:assert/strict";
import { before, test } from "node:test";

import { InvalidCriteria, resumingFrom } from "@sincpro/criteria";

import { DatabaseTableRepository } from "../../sincpro_mobile/adapters/repositories/database_table.repository.ts";
import { DomainValidationError } from "../../sincpro_mobile/exceptions.ts";
import { DBCursor } from "../../sincpro_mobile/infrastructure/database/index.ts";

before(async () => {
  await DBCursor.execAsync(
    "CREATE TABLE notes (uuid TEXT PRIMARY KEY NOT NULL, title TEXT, kind TEXT)",
  );
  for (let index = 0; index < 7; index++) {
    await DBCursor.mutateDatabase(
      "INSERT INTO notes (uuid, title, kind) VALUES (?, ?, ?)",
      `n-${index}`,
      `Note ${index}`,
      index % 2 === 0 ? "even" : "odd",
    );
  }
});

test("a table is read a page at a time, newest first, and its cursor walks every row once", async () => {
  const seen: unknown[] = [];
  let page = await DatabaseTableRepository.page("notes", { pagination: { limit: 3 } });
  const first = page;
  seen.push(...page.rows.map((row) => row.uuid));
  while (page.cursor !== null) {
    page = await DatabaseTableRepository.page(
      "notes",
      resumingFrom({ pagination: { limit: 3 } }, page.cursor),
    );
    seen.push(...page.rows.map((row) => row.uuid));
  }

  assert.deepEqual(seen, ["n-6", "n-5", "n-4", "n-3", "n-2", "n-1", "n-0"]);
  assert.deepEqual(first.count, { value: 7, exact: true });
  assert.deepEqual(Object.keys(first.rows[0]).sort(), ["kind", "title", "uuid"]);
});

test("a table's columns filter and order its page", async () => {
  const odd = await DatabaseTableRepository.page("notes", {
    selection: { field: "kind", operator: "=", value: "odd" },
    order: [{ field: "title" }],
  });

  assert.deepEqual(
    odd.rows.map((row) => row.uuid),
    ["n-1", "n-3", "n-5"],
  );
  assert.deepEqual(odd.count, { value: 3, exact: true });
});

test("a table the database does not have, or a column it lacks, is refused before any SQL", async () => {
  await assert.rejects(DatabaseTableRepository.page("missing"), DomainValidationError);
  await assert.rejects(
    DatabaseTableRepository.page("notes; DROP TABLE notes"),
    DomainValidationError,
  );
  await assert.rejects(
    DatabaseTableRepository.page("notes", {
      selection: { field: "secret", operator: "=", value: 1 },
    }),
    InvalidCriteria,
  );
  assert.equal((await DatabaseTableRepository.page("notes")).rows.length, 7);
});
