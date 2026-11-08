import assert from "node:assert/strict";
import test from "node:test";

import {
  type EventListItem,
  filterEvents,
} from "../../sincpro_mobile/ui/events/filter-events.ts";

const NOW = new Date(2026, 4, 8, 15, 0, 0);

function item(
  partial: Partial<EventListItem> & Pick<EventListItem, "name" | "createdAt">,
): EventListItem {
  return { status: "PENDING", ...partial };
}

const EVENTS: EventListItem[] = [
  item({
    name: "sale.order.confirmed",
    label: "Pedido confirmado",
    createdAt: "2026-05-08T10:00:00",
  }),
  item({
    name: "stock.picking.done",
    label: "Entrega validada",
    status: "FAILED",
    createdAt: "2026-05-05T10:00:00",
  }),
  item({
    name: "account.move.posted",
    label: "Factura publicada",
    status: "ACKNOWLEDGED",
    createdAt: "2026-04-20T10:00:00",
  }),
  item({
    name: "account.payment.posted",
    label: "Pago registrado",
    status: "CANCELLED",
    createdAt: "2026-03-01T10:00:00",
  }),
];

test("filterEvents matches the label or the technical name without accents", () => {
  assert.deepEqual(
    filterEvents(EVENTS, { query: "factura" }, NOW).map((event) => event.name),
    ["account.move.posted"],
  );
  assert.deepEqual(
    filterEvents(EVENTS, { query: "PICKING" }, NOW).map((event) => event.name),
    ["stock.picking.done"],
  );
});

test("filterEvents keeps the local calendar window", () => {
  assert.deepEqual(
    filterEvents(EVENTS, { range: "today" }, NOW).map((event) => event.name),
    ["sale.order.confirmed"],
  );
  assert.deepEqual(
    filterEvents(EVENTS, { range: "week" }, NOW).map((event) => event.name),
    ["sale.order.confirmed", "stock.picking.done"],
  );
  assert.deepEqual(
    filterEvents(EVENTS, { range: "month" }, NOW).map((event) => event.name),
    ["sale.order.confirmed", "stock.picking.done", "account.move.posted"],
  );
});

test("filterEvents applies a custom condition together with the quick filters", () => {
  const custom = {
    kind: "group" as const,
    join: "all" as const,
    children: [
      {
        kind: "condition" as const,
        field: "name",
        operator: "contains",
        values: ["move"],
      },
    ],
  };
  assert.deepEqual(
    filterEvents(EVENTS, { custom, range: "month" }, NOW).map((event) => event.name),
    ["account.move.posted"],
  );
  assert.deepEqual(
    filterEvents(EVENTS, { status: "FAILED", custom }, NOW).map((event) => event.name),
    [],
  );
});

test("filterEvents combines status, name and date", () => {
  assert.deepEqual(
    filterEvents(EVENTS, { status: "FAILED", query: "entrega", range: "week" }, NOW).map(
      (event) => event.name,
    ),
    ["stock.picking.done"],
  );
  assert.deepEqual(
    filterEvents(EVENTS, { status: "FAILED", query: "pedido", range: "today" }, NOW),
    [],
  );
});

test("filterEvents reads each event's text once while the user keeps typing", () => {
  let reads = 0;
  const event = {
    name: "invoice.sync",
    get label() {
      reads += 1;
      return "Sincronización de facturas";
    },
    createdAt: new Date().toISOString(),
  };
  for (const query of ["s", "si", "sin", "sinc", "factura", "x"]) {
    filterEvents([event], { query });
  }
  assert.equal(reads, 1);
  assert.deepEqual(filterEvents([event], { query: "SINCRONIZACION" }), [event]);
  assert.deepEqual(filterEvents([event], { query: "facturas\ninvoice" }), []);
});
