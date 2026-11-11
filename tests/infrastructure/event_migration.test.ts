import assert from "node:assert/strict";
import { test } from "node:test";

import { eventStore } from "../../sincpro_mobile/adapters/repositories/sqlite_event_store.ts";
import MIGRATIONS from "../../sincpro_mobile/entrypoints/db/migrations.ts";
import { DBCursor } from "../../sincpro_mobile/infrastructure/database/index.ts";

/** The bus's tables as a 1.x device has them. */
async function devicesBefore20(): Promise<void> {
  await DBCursor.execAsync(`
    CREATE TABLE domain_events (
      uuid TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, label TEXT NOT NULL, data TEXT NOT NULL,
      requires_network INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING', attempts INTEGER NOT NULL DEFAULT 0,
      error_message TEXT DEFAULT NULL, acknowledged_at TEXT DEFAULT NULL, failed_at TEXT DEFAULT NULL,
      aggregate_id TEXT DEFAULT NULL, source_id TEXT DEFAULT NULL, correlation_id TEXT DEFAULT NULL,
      sequence INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE domain_events_dead_letter (
      uuid TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, label TEXT NOT NULL, data TEXT NOT NULL,
      requires_network INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, error_message TEXT DEFAULT NULL, failed_at TEXT NOT NULL,
      aggregate_id TEXT DEFAULT NULL, source_id TEXT DEFAULT NULL, correlation_id TEXT DEFAULT NULL,
      sequence INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE event_queue (uuid TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE dead_letter_queue (uuid TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, payload TEXT NOT NULL);
  `);
  const row = (
    uuid: string,
    status: string,
    createdAt: string,
    extra: {
      error?: string;
      correlation?: string;
      causation?: string;
      attempts?: number;
    } = {},
  ) =>
    DBCursor.mutateDatabase(
      `INSERT INTO domain_events
       (uuid, name, label, data, created_at, status, attempts, error_message, acknowledged_at,
        failed_at, correlation_id, sequence)
       VALUES (?, ?, 'Imprimiendo', ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      uuid,
      "common.print.v1.image_requested",
      JSON.stringify({
        imageBase64: `image-${uuid}`,
        title: "ticket",
        name: "common.print.v1.image_requested",
        id: uuid,
        label: { default: "Imprimiendo" },
        created_at: createdAt,
        entity_type: "",
        entity_id: "",
        correlation_id: extra.correlation ?? null,
        causation_id: extra.causation ?? null,
        entity_version: null,
        sequence: 1,
        traceparent: "00-abc-def-01",
      }),
      createdAt,
      status,
      extra.attempts ?? 0,
      extra.error ?? null,
      status === "ACKNOWLEDGED" ? createdAt : null,
      status === "FAILED" ? createdAt : null,
      extra.correlation ?? null,
    );
  await row("p-1", "PENDING", "2026-05-01T10:00:00.000Z", {
    correlation: "flow-1",
    causation: "c-0",
  });
  await row("p-2", "PROCESSING", "2026-05-01T10:01:00.000Z", { attempts: 1 });
  await row("a-1", "ACKNOWLEDGED", "2026-05-01T09:00:00.000Z");
  await row("f-1", "FAILED", "2026-05-01T08:00:00.000Z", {
    error: "printer off",
    attempts: 2,
  });
  await row("x-1", "CANCELLED", "2026-05-01T07:00:00.000Z");
  await DBCursor.mutateDatabase(
    `INSERT INTO domain_events_dead_letter
     (uuid, name, label, data, created_at, attempts, error_message, failed_at, correlation_id)
     VALUES
     ('d-1', 'shop.order.v1.paid', 'Pagado', '{"order_id":"o-9","name":"shop.order.v1.paid","id":"d-1"}',
      '2026-04-30T10:00:00.000Z', 3, 'refused', '2026-04-30T11:00:00.000Z', 'flow-d'),
     ('f-1', 'common.print.v1.image_requested', 'Imprimiendo', '{}',
      '2026-05-01T08:00:00.000Z', 2, 'printer off', '2026-05-01T08:00:00.000Z', NULL)`,
  );
}

test("a 1.x device's events move into the stored queue: nothing is lost", async () => {
  await devicesBefore20();
  await DBCursor.transaction(async () => {
    await MIGRATIONS.find((one) => one.name === "stored_events")!.migrationFn();
  });

  const records = new Map((await eventStore.recent(100)).map((one) => [one.id, one]));
  assert.deepEqual([...records.keys()].sort(), ["a-1", "d-1", "f-1", "p-1", "p-2", "x-1"]);

  const pending = records.get("p-1")!;
  assert.equal(pending.state, "pending");
  assert.equal(pending.correlationId, "flow-1");
  assert.equal(pending.causationId, "c-0");
  assert.equal(pending.publishedAt, "2026-05-01T10:00:00.000Z");
  assert.deepEqual(pending.payload, { imageBase64: "image-p-1", title: "ticket" });

  assert.equal(records.get("p-2")!.state, "pending", "one being processed waits again");
  assert.equal(records.get("p-2")!.attempts, 1);
  assert.equal(records.get("a-1")!.state, "delivered");
  assert.equal(records.get("a-1")!.correlationId, "a-1", "a fact with no flow heads its own");

  const failed = records.get("f-1")!;
  assert.equal(failed.state, "set_aside");
  assert.equal(failed.attempts, 2);
  assert.equal(failed.error, "printer off");
  assert.deepEqual(failed.payload, { imageBase64: "image-f-1", title: "ticket" });
  assert.equal(records.get("x-1")!.state, "set_aside");

  const deadLetter = records.get("d-1")!;
  assert.equal(deadLetter.state, "set_aside");
  assert.equal(deadLetter.error, "refused");
  assert.deepEqual(deadLetter.payload, { order_id: "o-9" });

  const order = (await eventStore.recent(100)).reverse().map((one) => one.id);
  assert.deepEqual(
    order,
    ["x-1", "f-1", "a-1", "p-1", "p-2", "d-1"],
    "the order they were added",
  );
  assert.equal((await eventStore.next(new Set()))?.envelope.id, "p-1");

  const left = await DBCursor.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN
     ('domain_events', 'domain_events_dead_letter', 'event_queue', 'dead_letter_queue')`,
  );
  assert.deepEqual(left, [], "the bus's tables are gone");
});

test("a new device runs the retired migrations as no-ops and gets only the stored queue", async () => {
  for (const migration of MIGRATIONS) await migration.migrationFn();
  const tables = await DBCursor.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  );
  assert.deepEqual(
    tables.map((one) => one.name),
    ["settings", "spans_queue", "stored_events", "telemetry_queue"],
  );
});
