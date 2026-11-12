import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { installTimeZone } from "@sincpro/client-framework";
import { type Criteria, dynamic, merge } from "@sincpro/criteria";

import { replacedBy } from "../../sincpro_mobile/domain/database/criteria.ts";
import {
  compileCriteria,
  type CriteriaSqlTarget,
  deviceClock,
} from "../../sincpro_mobile/domain/database/criteria_sql.ts";
import { eventCriteria } from "../../sincpro_mobile/ui/events/filter-events.ts";

type Ticket = { state: string; total: number; due: string };

const open: Criteria<Ticket> = {
  selection: { field: "state", operator: "=", value: "open" },
};
const big: Criteria<Ticket> = { selection: { field: "total", operator: ">", value: 100 } };

const notes: CriteriaSqlTarget = { table: "notes", column: (field) => field === "uuid" };

afterEach(() => installTimeZone(undefined));

test("over the entity's defaults the caller wins, part by part, and its filter joins", () => {
  const defaults: Criteria<Ticket> = {
    ...open,
    order: [{ field: "total" }],
    pagination: { limit: 8 },
    specification: {},
  };
  const asked: Criteria<Ticket> = {
    ...big,
    pagination: { limit: 20, strategy: { token: "next" } },
    specification: { total: {} },
  };

  const read = replacedBy(defaults, asked);

  assert.deepEqual(read.selection, { all: [open.selection, big.selection] });
  assert.deepEqual(read.pagination, { limit: 20, strategy: { token: "next" } });
  assert.deepEqual(
    read.specification,
    { total: {} },
    "the caller's mask, not an intersection",
  );
  assert.deepEqual(read.order, [{ field: "total" }], "what the caller does not name stays");
  assert.deepEqual(replacedBy(defaults, {}), defaults);
});

test("a use case's scope only narrows: the caller cannot widen it", () => {
  const scope: Criteria<Ticket> = { ...open, specification: { state: {} } };
  const asked: Criteria<Ticket> = {
    selection: { field: "state", operator: "=", value: "closed" },
    specification: { state: {}, total: {} },
  };

  const read = merge<Ticket>(scope, asked);

  assert.deepEqual(read.selection, { all: [open.selection, asked.selection] });
  assert.deepEqual(read.specification, { state: {} }, "a mask can only take away");
});

test("today and a period are cut on the time zone the app installed, not the phone's", () => {
  const today: Criteria<Ticket> = {
    selection: { field: "due", operator: "between", value: dynamic.period("today") },
  };
  const evening = new Date("2026-10-24T20:00:00.000Z");

  installTimeZone("Asia/Tokyo");
  const tokyo = compileCriteria(today, notes, deviceClock(evening));
  installTimeZone("America/La_Paz");
  const laPaz = compileCriteria(today, notes, deviceClock(evening));

  assert.deepEqual(tokyo.params, ["2026-10-25", "2026-10-26"]);
  assert.deepEqual(laPaz.params, ["2026-10-24", "2026-10-25"]);
});

test("the screens' days start at midnight of the app's time zone", () => {
  const evening = new Date("2026-10-24T20:00:00.000Z");

  installTimeZone("Asia/Tokyo");
  const todayInTokyo = eventCriteria({ range: "today" }, evening);
  installTimeZone("America/La_Paz");
  const aDayInLaPaz = eventCriteria({
    custom: {
      kind: "group",
      join: "all",
      children: [
        {
          kind: "condition",
          field: "publishedAt",
          operator: "equal",
          values: ["2026-05-05"],
        },
      ],
    },
  });

  assert.deepEqual(todayInTokyo.selection, {
    field: "publishedAt",
    operator: ">=",
    value: "2026-10-24T15:00:00.000Z",
  });
  assert.deepEqual(aDayInLaPaz.selection, {
    all: [
      { field: "publishedAt", operator: ">=", value: "2026-05-05T04:00:00.000Z" },
      { field: "publishedAt", operator: "<", value: "2026-05-06T04:00:00.000Z" },
    ],
  });
});
