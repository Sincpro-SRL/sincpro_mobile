import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import type { StoredMessage } from "@sincpro/client-framework";

import { eventStore } from "../../sincpro_mobile/adapters/repositories/sqlite_event_store.ts";
import MIGRATIONS from "../../sincpro_mobile/entrypoints/db/migrations.ts";
import { DBCursor } from "../../sincpro_mobile/infrastructure/database/index.ts";

let tableReady = false;

async function storedEventsTable(): Promise<void> {
  if (tableReady) return;
  const migration = MIGRATIONS.find((one) => one.name === "stored_events");
  assert.ok(migration, "the stored_events migration exists");
  await migration.migrationFn();
  tableReady = true;
}

function message(
  id: string,
  overrides: Partial<StoredMessage> & { name?: string; publishedAt?: string } = {},
): StoredMessage {
  const {
    name = "test.thing.v1.happened",
    publishedAt = new Date().toISOString(),
    ...rest
  } = overrides;
  return {
    kind: "event",
    answer: null,
    envelope: { name, id, correlationId: `flow-${id}`, causationId: null, publishedAt },
    payload: { value: id },
    state: "pending",
    attempts: 0,
    retryAt: null,
    reached: [],
    failures: [],
    ...rest,
  };
}

beforeEach(async () => {
  await storedEventsTable();
  await eventStore.clear();
  eventStore.useCatalog(() => undefined);
});

test("next answers the oldest waiting message in the order added, but those skipped", async () => {
  await eventStore.add(message("b"));
  await eventStore.add(message("a"));
  await eventStore.add(message("c", { state: "delivered" }));
  assert.equal((await eventStore.next(new Set()))?.envelope.id, "b");
  assert.equal((await eventStore.next(new Set(["b"])))?.envelope.id, "a");
  assert.equal(await eventStore.next(new Set(["b", "a"])), undefined);
});

test("a message keeps its envelope and values, and adding it twice keeps it once", async () => {
  const kept = message("m-1", { name: "shop.order.v1.paid" });
  await eventStore.add(kept);
  await eventStore.add({ ...kept, payload: { value: "other" } });
  assert.deepEqual(await eventStore.next(new Set()), kept);
  assert.equal(await eventStore.count(), 1);
});

test("save writes how the delivery went; a settled message is no longer next", async () => {
  await eventStore.add(message("m-2"));
  const head = (await eventStore.next(new Set()))!;
  await eventStore.save({
    ...head,
    state: "pending",
    attempts: 1,
    retryAt: "2026-01-01T00:00:00.000Z",
    reached: ["shop"],
    failures: [
      { boundedContext: "mail", kind: "unavailable", reason: "UNAVAILABLE", message: "down" },
    ],
  });
  const again = (await eventStore.next(new Set()))!;
  assert.equal(again.attempts, 1);
  assert.equal(again.retryAt, "2026-01-01T00:00:00.000Z");
  assert.deepEqual(again.reached, ["shop"]);
  assert.equal(again.failures[0]?.boundedContext, "mail");

  await eventStore.save({ ...again, state: "delivered", retryAt: null, failures: [] });
  assert.equal(await eventStore.next(new Set()), undefined);
  const [record] = await eventStore.byIds(["m-2"]);
  assert.equal(record?.state, "delivered");
  assert.ok(record?.settledAt, "a settled message says when");
});

test("add joins the transaction that is open: rolled back, nothing is kept", async () => {
  await assert.rejects(
    DBCursor.transaction(async () => {
      await eventStore.add(message("in-tx"));
      throw new Error("the aggregate failed to save");
    }),
    /failed to save/,
  );
  assert.equal(await eventStore.count(), 0);
  await DBCursor.transaction(async () => {
    await eventStore.add(message("committed"));
  });
  assert.equal(await eventStore.count(), 1);
});

test("a retry sends a set-aside message back once, without the parties that failed", async () => {
  await eventStore.add(
    message("failed", {
      state: "set_aside",
      attempts: 3,
      reached: ["shop", "mail"],
      failures: [
        { boundedContext: "mail", kind: "invalid", reason: "INVALID", message: "no email" },
      ],
    }),
  );
  await eventStore.add(message("fine", { state: "delivered" }));
  assert.equal(await eventStore.retry(["failed", "fine"]), 1);
  assert.equal(await eventStore.retry(["failed"]), 0, "the same failure is retried once");
  const back = (await eventStore.next(new Set()))!;
  assert.equal(back.envelope.id, "failed");
  assert.equal(back.attempts, 0);
  assert.deepEqual(back.reached, ["shop"]);
  assert.deepEqual(back.failures, []);
});

test("screens read records newest first, bounded, with the class's label and the error", async () => {
  eventStore.useCatalog((name) =>
    name === "shop.order.v1.paid" ? { label: { es: "Pedido pagado" } } : undefined,
  );
  await eventStore.add(message("old", { name: "shop.order.v1.paid" }));
  await eventStore.add(
    message("new", {
      state: "set_aside",
      failures: [
        { boundedContext: "mail", kind: "invalid", reason: "INVALID", message: "no email" },
      ],
    }),
  );
  const recent = await eventStore.recent(1);
  assert.deepEqual(
    recent.map((record) => [record.id, record.label, record.error]),
    [["new", "test.thing.v1.happened", "no email"]],
  );
  const [old] = eventStore.findByIdsSync(["old"]);
  assert.equal(old?.label, "Pedido pagado");
  assert.deepEqual(
    (await eventStore.inState("set_aside")).map((record) => record.id),
    ["new"],
  );
});

test("the failed ones' retention deletes only those set aside before the cutoff", async () => {
  const past = "2026-01-01T00:00:00.000Z";
  await eventStore.add(message("failed-old", { state: "set_aside", publishedAt: past }));
  await eventStore.add(message("delivered-old", { state: "delivered", publishedAt: past }));
  await eventStore.add(message("pending-old", { publishedAt: past }));
  await eventStore.add(message("failed-new", { state: "set_aside", publishedAt: past }));
  await DBCursor.mutateDatabase(
    "UPDATE stored_events SET settled_at = ? WHERE id = ?",
    past,
    "failed-old",
  );
  await eventStore.pruneFailedBefore("2026-06-01T00:00:00.000Z");
  assert.deepEqual((await eventStore.recent(10)).map((record) => record.id).sort(), [
    "delivered-old",
    "failed-new",
    "pending-old",
  ]);
});

test("emptying takes the states it is given, whatever their age, and says how many", async () => {
  await eventStore.add(message("delivered", { state: "delivered" }));
  await eventStore.add(message("failed", { state: "set_aside" }));
  await eventStore.add(message("pending"));
  assert.equal(await eventStore.clearIn(["delivered", "set_aside"]), 2);
  assert.deepEqual(
    (await eventStore.recent(10)).map((record) => record.id),
    ["pending"],
  );
  assert.equal(await eventStore.clearIn([]), 0);
});

test("retention deletes only delivered messages published before the cutoff", async () => {
  const past = "2026-01-01T00:00:00.000Z";
  await eventStore.add(message("delivered-old", { state: "delivered", publishedAt: past }));
  await eventStore.add(message("pending-old", { publishedAt: past }));
  await eventStore.add(message("failed-old", { state: "set_aside", publishedAt: past }));
  await eventStore.add(message("delivered-new", { state: "delivered" }));
  await eventStore.pruneDeliveredBefore("2026-06-01T00:00:00.000Z");
  assert.deepEqual((await eventStore.recent(10)).map((record) => record.id).sort(), [
    "delivered-new",
    "failed-old",
    "pending-old",
  ]);
});
