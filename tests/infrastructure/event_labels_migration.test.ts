import assert from "node:assert/strict";
import { test } from "node:test";

import { eventStore } from "../../sincpro_mobile/adapters/repositories/sqlite_event_store.ts";
import MIGRATIONS from "../../sincpro_mobile/entrypoints/db/migrations.ts";
import { DBCursor } from "../../sincpro_mobile/infrastructure/database/index.ts";

test("a queue stored before labels were kept gets them: each message labelled by its name", async () => {
  await DBCursor.execAsync(`
    CREATE TABLE stored_events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL DEFAULT 'event', name TEXT NOT NULL, correlation_id TEXT NOT NULL,
      causation_id TEXT DEFAULT NULL, published_at TEXT NOT NULL, payload TEXT NOT NULL,
      state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, retry_at TEXT DEFAULT NULL,
      reached TEXT NOT NULL DEFAULT '[]', failures TEXT NOT NULL DEFAULT '[]',
      settled_at TEXT DEFAULT NULL, answer TEXT DEFAULT NULL
    );
    INSERT INTO stored_events (id, name, correlation_id, published_at, payload, state)
    VALUES ('old', 'Shop.Order.v1.Paid', 'old', '2026-01-01T00:00:00.000Z', '{}', 'delivered');
  `);
  const migration = MIGRATIONS.find((one) => one.name === "stored_events_labels");
  assert.ok(migration, "the labels migration exists");

  await migration.migrationFn();
  await migration.migrationFn();
  const found = await eventStore.search({
    selection: { field: "label", operator: "like", value: "SHOP.ORDER" },
  });

  assert.deepEqual(
    found.rows.map((record) => [record.id, record.label]),
    [["old", "Shop.Order.v1.Paid"]],
  );
});
