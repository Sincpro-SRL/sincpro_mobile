import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import type { StoredMessage } from "@sincpro/client-framework";
import { type Criteria, InvalidCriteria, resumingFrom } from "@sincpro/criteria";

import { eventStore } from "../../sincpro_mobile/adapters/repositories/sqlite_event_store.ts";
import type { EventRecord } from "../../sincpro_mobile/domain/events/index.ts";
import MIGRATIONS from "../../sincpro_mobile/entrypoints/db/migrations.ts";

let tableReady = false;

const CATALOG: Record<string, object> = {
  "shop.print.v1.requested": { label: "Impresión de ticket" },
  "shop.order.v1.paid": { label: "Pago de orden" },
};

beforeEach(async () => {
  if (!tableReady) {
    const migration = MIGRATIONS.find((one) => one.name === "stored_events");
    assert.ok(migration);
    await migration.migrationFn();
    tableReady = true;
  }
  await eventStore.clear();
  eventStore.useCatalog((name) => CATALOG[name]);
});

function message(
  id: string,
  name: string,
  overrides: Partial<StoredMessage> & { publishedAt?: string } = {},
): StoredMessage {
  const { publishedAt = "2026-11-10T12:00:00.000Z", ...rest } = overrides;
  return {
    kind: "event",
    answer: null,
    envelope: { name, id, correlationId: `flow-${id}`, causationId: null, publishedAt },
    payload: {},
    state: "pending",
    attempts: 0,
    retryAt: null,
    reached: [],
    failures: [],
    ...rest,
  };
}

async function added(count: number, name = "shop.order.v1.paid"): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < count; index++) {
    const id = `e-${String(index).padStart(3, "0")}`;
    await eventStore.add(message(id, name));
    ids.push(id);
  }
  return ids;
}

async function walked(criteria: Criteria<EventRecord>): Promise<string[]> {
  const seen: string[] = [];
  let asked = criteria;
  for (let pages = 0; pages < 50; pages++) {
    const page = await eventStore.search(asked);
    seen.push(...page.rows.map((record) => record.id));
    if (page.cursor === null) return seen;
    asked = resumingFrom(criteria, page.cursor);
  }
  throw new Error("the cursor never ended");
}

const ids = (records: readonly EventRecord[]) => records.map((record) => record.id);

test("a search reads newest first, a page at a time, and walks every event once", async () => {
  const made = await added(12);

  const first = await eventStore.search({ pagination: { limit: 5 } });
  const all = await walked({ pagination: { limit: 5 } });

  assert.deepEqual(ids(first.rows), [...made].reverse().slice(0, 5));
  assert.notEqual(first.cursor, null);
  assert.deepEqual(first.count, { value: 12, exact: true });
  assert.deepEqual(all, [...made].reverse());
});

test("state, name, attempts and the publishing date filter in SQL", async () => {
  await eventStore.add(
    message("a", "shop.order.v1.paid", { publishedAt: "2026-11-01T10:00:00.000Z" }),
  );
  await eventStore.add(
    message("b", "shop.order.v1.paid", { state: "set_aside", attempts: 3 }),
  );
  await eventStore.add(message("c", "shop.print.v1.requested", { state: "set_aside" }));

  const failed = await eventStore.search({
    selection: { field: "state", operator: "=", value: "set_aside" },
  });
  const tried = await eventStore.search({
    selection: { field: "attempts", operator: ">", value: 1 },
  });
  const recent = await eventStore.search({
    selection: { field: "publishedAt", operator: ">=", value: "2026-11-05T00:00:00.000Z" },
  });
  const paid = await eventStore.search({
    selection: { field: "name", operator: "like", value: "ORDER" },
  });

  assert.deepEqual(ids(failed.rows), ["c", "b"]);
  assert.deepEqual(ids(tried.rows), ["b"]);
  assert.deepEqual(ids(recent.rows), ["c", "b"]);
  assert.deepEqual(ids(paid.rows), ["b", "a"]);
});

test("a condition on the label reads the class's label, without accents or case", async () => {
  await eventStore.add(message("print", "shop.print.v1.requested"));
  await eventStore.add(message("pay", "shop.order.v1.paid"));
  await eventStore.add(message("other", "shop.unknown.v1.happened"));

  const impresion = await eventStore.search({
    selection: { field: "label", operator: "like", value: "IMPRESION" },
  });
  const exact = await eventStore.search({
    selection: { field: "label", operator: "=", value: "pago de orden" },
  });
  const notPrints = await eventStore.search({
    selection: { negate: { field: "label", operator: "like", value: "impresión" } },
  });
  const byName = await eventStore.search({
    selection: { field: "label", operator: "like", value: "unknown" },
  });
  const none = await eventStore.search({
    selection: { field: "label", operator: "like", value: "nada" },
  });

  assert.deepEqual(ids(impresion.rows), ["print"]);
  assert.equal(impresion.rows[0].label, "Impresión de ticket");
  assert.deepEqual(ids(exact.rows), ["pay"]);
  assert.deepEqual(ids(notPrints.rows), ["other", "pay"]);
  assert.deepEqual(
    ids(byName.rows),
    ["other"],
    "an event without a label is named by its name",
  );
  assert.deepEqual(none.rows, []);
});

test("a typed text finds an event by its label or its name, and pages through them", async () => {
  const prints = await added(4, "shop.print.v1.requested");
  await eventStore.add(message("pay", "shop.order.v1.paid"));
  const typed: Criteria<EventRecord> = {
    selection: {
      any: [
        { field: "label", operator: "like", value: "impresion" },
        { field: "name", operator: "like", value: "impresion" },
      ],
    },
    pagination: { limit: 3 },
  };

  const found = await walked(typed);
  const first = await eventStore.search(typed);

  assert.deepEqual(found, [...prints].reverse());
  assert.deepEqual(first.count, { value: 4, exact: true });
});

test("a field an event does not have is refused; its label is kept, so it orders too", async () => {
  await eventStore.add(message("pay", "shop.order.v1.paid"));
  await eventStore.add(message("print", "shop.print.v1.requested"));

  await assert.rejects(
    eventStore.search({
      selection: { field: "payload" as never, operator: "=", value: "x" },
    }),
    InvalidCriteria,
  );
  const byLabel = await eventStore.search({ order: [{ field: "label" }] });

  assert.deepEqual(ids(byLabel.rows), ["print", "pay"]);
});

test("the label is the one the class gave when the event was queued", async () => {
  await eventStore.add(message("print", "shop.print.v1.requested"));
  eventStore.useCatalog(() => undefined);

  const [kept] = (await eventStore.search()).rows;

  assert.equal(kept.label, "Impresión de ticket", "the module may no longer be active");
});

test("the count can be skipped, and a page past rows has no cursor", async () => {
  await added(6);

  const uncounted = await eventStore.search({ pagination: { limit: 2 }, count: "none" });
  const skipped = await eventStore.search({
    pagination: { limit: 2, strategy: { rows: 2 } },
  });

  assert.equal(uncounted.count, null);
  assert.deepEqual(ids(skipped.rows), ["e-003", "e-002"]);
  assert.equal(skipped.cursor, null);
});
