import assert from "node:assert/strict";
import test from "node:test";

import { criteria, dynamic, InvalidCriteria, selection, type Value } from "@sincpro/criteria";

import {
  compileCriteria,
  type CriteriaSqlTarget,
  rowsFor,
  type SqlDocument,
} from "../../sincpro_mobile/domain/database/criteria_sql.ts";

const notes: CriteriaSqlTarget = {
  table: "notes",
  column: (field) => field === "title" || field === "uuid" || field === "version",
  relation: (name) => (name === "lines" ? lines : undefined),
};

const lines: CriteriaSqlTarget = {
  table: "lines",
  column: (field) => field === "uuid" || field === "version",
};

function row(partial: Partial<SqlDocument> & { data: string }): SqlDocument {
  return {
    uuid: partial.uuid ?? "a",
    version: partial.version ?? 1,
    data: partial.data,
    columns: partial.columns ?? {},
  };
}

test("a column and a JSON field become one statement", () => {
  const compiled = compileCriteria(
    criteria<{ title: string; vat: string }>()
      .selection(["title", "=", "Posted"], ["vat", "like", "50%"])
      .order("title")
      .limit(2).value,
    notes,
  );

  assert.equal(
    compiled.whereSql,
    "(notes.title = ? AND lower(json_extract(notes.data, '$.vat')) LIKE ? ESCAPE '\\')",
  );
  assert.deepEqual(compiled.params, ["Posted", "%50\\%%"]);
  assert.equal(compiled.orderSql, "notes.title ASC, notes.uuid ASC");
  assert.equal(compiled.limit, 2);
});

test("a nested JSON path and a relation both compile", () => {
  const compiled = compileCriteria(
    {
      selection: {
        all: [
          { field: "address.city", operator: "=", value: "Heredia" },
          {
            through: "lines",
            selection: { field: "amount", operator: ">", value: 10 },
          },
        ],
      },
    },
    notes,
  );

  assert.match(compiled.whereSql, /json_extract\(notes\.data, '\$\.address\.city'\) = \?/);
  assert.match(
    compiled.whereSql,
    /EXISTS \(SELECT 1 FROM lines WHERE \(lines\.uuid = json_extract\(notes\.data, '\$\.lines'\) OR lines\.uuid IN \(SELECT value FROM json_each\(notes\.data, '\$\.lines'\)\)\) AND \(json_extract\(lines\.data, '\$\.amount'\) > \?\)\)/,
  );
  assert.deepEqual(compiled.params, ["Heredia", 10]);
});

test("rowsFor answers the same question as the statement", () => {
  const compiled = compileCriteria(
    criteria<{ title: string; vat: string }>().selection(
      selection.any(["title", "like", "acme"], ["vat", "=", "3101"]),
    ).value,
    notes,
  );
  const matched = rowsFor(compiled, [
    row({
      uuid: "1",
      columns: { title: "Acme" },
      data: JSON.stringify({ title: "Acme", vat: "1" }),
    }),
    row({
      uuid: "2",
      columns: { title: "Other" },
      data: JSON.stringify({ title: "Other", vat: "3101" }),
    }),
    row({
      uuid: "3",
      columns: { title: "South" },
      data: JSON.stringify({ title: "South", vat: "9" }),
    }),
  ]);

  assert.deepEqual(
    matched.map((item) => item.uuid),
    ["1", "2"],
  );
});

test("a relation matches the child whose id is stored in the JSON", () => {
  const compiled = compileCriteria(
    {
      selection: {
        through: "lines",
        selection: { field: "amount", operator: ">", value: 10 },
      },
    },
    notes,
  );
  const matched = rowsFor(
    compiled,
    [
      row({ uuid: "order-1", data: JSON.stringify({ lines: ["line-1"] }) }),
      row({ uuid: "order-2", data: JSON.stringify({ lines: ["line-2"] }) }),
    ],
    () => [
      row({ uuid: "line-1", data: JSON.stringify({ amount: 12 }) }),
      row({ uuid: "line-2", data: JSON.stringify({ amount: 1 }) }),
    ],
  );

  assert.deepEqual(
    matched.map((item) => item.uuid),
    ["order-1"],
  );
});

test("a field that is not an identifier is refused", () => {
  assert.throws(
    () =>
      compileCriteria({ selection: { field: "vat;drop", operator: "=", value: 1 } }, notes),
    InvalidCriteria,
  );
});

const utc = { now: new Date("2026-10-24T15:00:00.000Z"), timeZone: "UTC" };

test("today is the date in the clock timezone and now is the same instant in UTC", () => {
  const compiled = compileCriteria(
    criteria<{ due: string; seen: string }>().selection(
      ["due", "<", dynamic.today()],
      ["seen", ">=", dynamic.now()],
    ).value,
    notes,
    utc,
  );

  assert.equal(compiled.whereSql.includes("json_extract(notes.data, '$.due') < ?"), true);
  assert.deepEqual(compiled.params, ["2026-10-24", "2026-10-24T15:00:00.000Z"]);
});

test("today moves on the calendar before it snaps", () => {
  const march = { now: new Date("2026-03-14T12:00:00.000Z"), timeZone: "UTC" };
  const compiled = compileCriteria(
    {
      selection: {
        field: "due",
        operator: ">=",
        value: dynamic.today({ minus: { days: 30 }, startOf: "month" }),
      },
    },
    notes,
    march,
  );
  const january = compileCriteria(
    {
      selection: {
        field: "due",
        operator: "=",
        value: dynamic.today({ plus: { months: 1 } }),
      },
    },
    notes,
    { now: new Date("2026-01-31T00:00:00.000Z"), timeZone: "UTC" },
  );
  const week = compileCriteria(
    {
      selection: {
        field: "due",
        operator: ">=",
        value: dynamic.today({ startOf: "week" }),
      },
    },
    notes,
    utc,
  );

  assert.deepEqual(compiled.params, ["2026-02-01"]);
  assert.deepEqual(january.params, ["2026-02-28"]);
  assert.deepEqual(week.params, ["2026-10-19"]);
});

test("today follows the wall date and now snaps to the start of that day", () => {
  const lapaz = { now: new Date("2026-10-24T03:00:00.000Z"), timeZone: "America/La_Paz" };
  const today = compileCriteria(
    { selection: { field: "due", operator: "=", value: dynamic.today() } },
    notes,
    lapaz,
  );
  const start = compileCriteria(
    {
      selection: {
        field: "seen",
        operator: ">=",
        value: dynamic.now({ startOf: "day" }),
      },
    },
    notes,
    lapaz,
  );
  const moved = compileCriteria(
    {
      selection: {
        field: "seen",
        operator: ">=",
        value: dynamic.now({ minus: { hours: 2 } }),
      },
    },
    notes,
    utc,
  );
  const shifted = compileCriteria(
    {
      selection: {
        field: "seen",
        operator: ">=",
        value: dynamic.now({ plus: { days: 1, hours: 2 }, startOf: "day" }),
      },
    },
    notes,
    utc,
  );

  assert.deepEqual(today.params, ["2026-10-23"]);
  assert.deepEqual(start.params, ["2026-10-23T04:00:00.000Z"]);
  assert.deepEqual(moved.params, ["2026-10-24T13:00:00.000Z"]);
  assert.deepEqual(shifted.params, ["2026-10-25T00:00:00.000Z"]);
});

test("a period is the half-open range of the wall date", () => {
  const month = compileCriteria(
    {
      selection: { field: "due", operator: "between", value: dynamic.period("this_month") },
    },
    notes,
    utc,
  );
  const lastMonth = compileCriteria(
    {
      selection: { field: "due", operator: "between", value: dynamic.period("last_month") },
    },
    notes,
    utc,
  );
  const days = compileCriteria(
    {
      selection: {
        field: "due",
        operator: "between",
        value: dynamic.period({ unit: "day", last: 30 }),
      },
    },
    notes,
    utc,
  );
  const weeks = compileCriteria(
    {
      selection: {
        field: "due",
        operator: "between",
        value: dynamic.period({ unit: "week", next: 2, includeCurrent: true }),
      },
    },
    notes,
    utc,
  );
  const quarter = compileCriteria(
    {
      selection: { field: "due", operator: "between", value: dynamic.period("this_quarter") },
    },
    notes,
    utc,
  );
  const wall = compileCriteria(
    { selection: { field: "due", operator: "between", value: dynamic.period("today") } },
    notes,
    { now: new Date("2026-10-24T03:00:00.000Z"), timeZone: "America/La_Paz" },
  );
  const matched = rowsFor(month, [
    row({ uuid: "start", data: JSON.stringify({ due: "2026-10-01" }) }),
    row({ uuid: "inside", data: JSON.stringify({ due: "2026-10-24T15:00:00.000Z" }) }),
    row({ uuid: "end", data: JSON.stringify({ due: "2026-11-01" }) }),
  ]);

  assert.equal(month.whereSql.includes("BETWEEN"), false);
  assert.equal(month.whereSql.includes(">="), true);
  assert.equal(month.whereSql.includes("<"), true);
  assert.deepEqual(month.params, ["2026-10-01", "2026-11-01"]);
  assert.deepEqual(lastMonth.params, ["2026-09-01", "2026-10-01"]);
  assert.deepEqual(days.params, ["2026-09-24", "2026-10-24"]);
  assert.deepEqual(weeks.params, ["2026-10-19", "2026-11-02"]);
  assert.deepEqual(quarter.params, ["2026-10-01", "2027-01-01"]);
  assert.deepEqual(wall.params, ["2026-10-23", "2026-10-24"]);
  assert.deepEqual(
    matched.map((item) => item.uuid),
    ["start", "inside"],
  );
});

test("a period off between, a context value, hours on today, and a token page are refused", () => {
  assert.throws(
    () =>
      compileCriteria(
        { selection: { field: "due", operator: "=", value: dynamic.period("this_month") } },
        notes,
        utc,
      ),
    /between/,
  );
  assert.throws(
    () =>
      compileCriteria(
        {
          selection: {
            field: "due",
            operator: "in",
            value: [dynamic.period("today")],
          },
        },
        notes,
        utc,
      ),
    /one item of a list/,
  );
  assert.throws(
    () =>
      compileCriteria(
        {
          selection: {
            field: "due",
            operator: "between",
            value: { $: "period" } as Value,
          },
        },
        notes,
        utc,
      ),
    /last/,
  );
  assert.throws(
    () =>
      compileCriteria(
        { selection: { field: "owner", operator: "=", value: dynamic.context("user_id") } },
        notes,
        utc,
      ),
    /context/,
  );
  assert.throws(
    () =>
      compileCriteria(
        {
          selection: {
            field: "due",
            operator: "<",
            value: dynamic.today({ minus: { hours: 1 } }),
          },
        },
        notes,
        utc,
      ),
    /hours/,
  );
  assert.throws(
    () => compileCriteria({ pagination: { strategy: { token: "abc" } } }, notes),
    InvalidCriteria,
  );
});
