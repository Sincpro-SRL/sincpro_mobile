import assert from "node:assert/strict";
import { before, test } from "node:test";

import type { StoredMessage } from "@sincpro/client-framework";

import { eventStore } from "../../sincpro_mobile/adapters/repositories/sqlite_event_store.ts";
import MIGRATIONS from "../../sincpro_mobile/entrypoints/db/migrations.ts";
import {
  eventCriteria,
  type EventDateRange,
  type EventStatusFilter,
} from "../../sincpro_mobile/ui/events/filter-events.ts";

const NOW = new Date(2026, 4, 8, 15, 0, 0);

const LABELS: Record<string, string> = {
  "sale.order.confirmed": "Pedido confirmado",
  "stock.picking.done": "Entrega validada",
  "account.move.posted": "Factura publicada",
  "account.payment.posted": "Pago registrado",
  "invoice.sync": "Sincronización de facturas",
};

/** Oldest first, so the screens' newest-first order reads them back to front. */
const STORED: [name: string, state: StoredMessage["state"], at: Date, attempts: number][] = [
  ["invoice.sync", "delivered", new Date(2026, 1, 1, 9), 0],
  ["account.payment.posted", "set_aside", new Date(2026, 2, 1, 10), 5],
  ["account.move.posted", "delivered", new Date(2026, 3, 20, 10), 1],
  ["stock.picking.done", "set_aside", new Date(2026, 4, 5, 10), 3],
  ["sale.order.confirmed", "pending", new Date(2026, 4, 8, 10), 0],
];

before(async () => {
  const migration = MIGRATIONS.find((one) => one.name === "stored_events");
  assert.ok(migration);
  await migration.migrationFn();
  await eventStore.clear();
  eventStore.useCatalog((name) => (LABELS[name] ? { label: LABELS[name] } : undefined));
  for (const [name, state, at, attempts] of STORED) {
    await eventStore.add({
      kind: "event",
      answer: null,
      envelope: {
        name,
        id: name,
        correlationId: name,
        causationId: null,
        publishedAt: at.toISOString(),
      },
      payload: {},
      state,
      attempts,
      retryAt: null,
      reached: [],
      failures: [],
    });
  }
});

type Filters = Parameters<typeof eventCriteria>[0];

async function listed(filters: Filters): Promise<string[]> {
  const page = await eventStore.search(eventCriteria(filters, NOW));
  return page.rows.map((record) => record.name);
}

function custom(
  ...children: { field: string; operator: string; values: (string | number)[] }[]
) {
  return {
    kind: "group" as const,
    join: "all" as const,
    children: children.map((child) => ({ kind: "condition" as const, ...child })),
  };
}

test("no filter asks nothing: every event, newest first", async () => {
  assert.deepEqual(eventCriteria({}, NOW), {});
  assert.deepEqual(
    await listed({}),
    [...STORED].reverse().map(([name]) => name),
  );
});

test("a typed text finds the label or the technical name, without accents or case", async () => {
  assert.deepEqual(await listed({ query: "factura" }), [
    "account.move.posted",
    "invoice.sync",
  ]);
  assert.deepEqual(await listed({ query: "PICKING" }), ["stock.picking.done"]);
  assert.deepEqual(await listed({ query: "SINCRONIZACION" }), ["invoice.sync"]);
  assert.deepEqual(await listed({ query: "facturas\ninvoice" }), []);
});

test("the date chips keep the local calendar window", async () => {
  const windows: [EventDateRange, string[]][] = [
    ["today", ["sale.order.confirmed"]],
    ["week", ["sale.order.confirmed", "stock.picking.done"]],
    ["month", ["sale.order.confirmed", "stock.picking.done", "account.move.posted"]],
  ];
  for (const [range, expected] of windows) {
    assert.deepEqual(await listed({ range }), expected, range);
  }
});

test("status, text and date combine, and the custom filter joins them", async () => {
  const set_aside: EventStatusFilter = "set_aside";
  const move = custom({ field: "name", operator: "contains", values: ["move"] });

  assert.deepEqual(await listed({ status: set_aside, query: "entrega", range: "week" }), [
    "stock.picking.done",
  ]);
  assert.deepEqual(await listed({ status: set_aside, query: "pedido", range: "today" }), []);
  assert.deepEqual(await listed({ custom: move, range: "month" }), ["account.move.posted"]);
  assert.deepEqual(await listed({ status: set_aside, custom: move }), []);
});

test("the custom filter's days, attempts and joins read as the builder shows them", async () => {
  const cases: [Filters["custom"], string[]][] = [
    [
      custom({ field: "publishedAt", operator: "equal", values: ["2026-05-05"] }),
      ["stock.picking.done"],
    ],
    [
      custom({ field: "publishedAt", operator: "before", values: ["2026-03-01"] }),
      ["invoice.sync"],
    ],
    [
      custom({ field: "publishedAt", operator: "after", values: ["2026-05-05"] }),
      ["sale.order.confirmed"],
    ],
    [
      custom({
        field: "publishedAt",
        operator: "between",
        values: ["2026-03-01", "2026-04-20"],
      }),
      ["account.move.posted", "account.payment.posted"],
    ],
    [
      custom({ field: "attempts", operator: "greater", values: [2] }),
      ["stock.picking.done", "account.payment.posted"],
    ],
    [
      custom({ field: "attempts", operator: "between", values: [1, 3] }),
      ["stock.picking.done", "account.move.posted"],
    ],
    [
      custom({ field: "label", operator: "equal", values: ["pago registrado"] }),
      ["account.payment.posted"],
    ],
    [
      {
        kind: "group",
        join: "none",
        children: [
          { kind: "condition", field: "state", operator: "equal", values: ["set_aside"] },
        ],
      },
      ["sale.order.confirmed", "account.move.posted", "invoice.sync"],
    ],
  ];
  for (const [filter, expected] of cases) {
    assert.deepEqual(await listed({ custom: filter }), expected, JSON.stringify(filter));
  }
});

test("the screen's filter is one SQL page: its count is the filter's, not the page's", async () => {
  const page = await eventStore.search({
    ...eventCriteria({ query: "posted" }, NOW),
    pagination: { limit: 1 },
  });

  assert.deepEqual(
    page.rows.map((record) => record.name),
    ["account.move.posted"],
  );
  assert.deepEqual(page.count, { value: 2, exact: true });
  assert.notEqual(page.cursor, null);
});
