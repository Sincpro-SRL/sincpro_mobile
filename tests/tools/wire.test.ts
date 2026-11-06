import assert from "node:assert/strict";
import test from "node:test";

import { Decimal, isDay, Money } from "@sincpro/client-framework";

import {
  generateUUID,
  isEntityId,
  momentOf,
} from "../../sincpro_mobile/infrastructure/database/utils.ts";
import {
  formatDate,
  getCurrentDateInTimezone,
} from "../../sincpro_mobile/tools/utils/date.ts";
import {
  calculateDiscountedTotal,
  formatTwoDecimals,
  parseToMonetaryNumber,
} from "../../sincpro_mobile/tools/utils/monetary.ts";
import {
  safeJsonParse,
  safeJsonStringify,
} from "../../sincpro_mobile/tools/utils/serializer.ts";

test("a new id is the client framework's UUID v7", () => {
  const id = generateUUID();
  assert.equal(isEntityId(id), true);
  assert.equal(id.includes("-"), false);
  const minted = momentOf(id);
  assert.ok(minted);
  assert.ok(Math.abs(Date.parse(minted!) - Date.now()) < 5_000);
});

test("a document drops private keys and writes an instant and bytes as the wire does", () => {
  const json = safeJsonStringify({
    title: "a",
    _held: ["secret"],
    at: new Date("2026-03-12T14:30:00.000Z"),
    photo: new Uint8Array([104, 105]),
  });
  const parsed = JSON.parse(json) as {
    title: string;
    at: string;
    photo: { $bytes: string };
    _held?: unknown;
  };
  assert.equal(parsed.title, "a");
  assert.equal("_held" in parsed, false);
  assert.equal(parsed.at, "2026-03-12T14:30:00.000Z");
  assert.equal(parsed.photo.$bytes, "aGk=");

  const read = safeJsonParse(json) as { photo: Uint8Array };
  assert.deepEqual([...read.photo], [104, 105]);
});

test("money and a decimal travel as text, and a discount is not a float", () => {
  const json = safeJsonStringify({
    total: new Money("19.90", "BOB"),
    qty: new Decimal("2.500"),
  });
  assert.deepEqual(JSON.parse(json), {
    total: { amount: "19.90", currency: "BOB" },
    qty: "2.500",
  });

  assert.equal(parseToMonetaryNumber("1.2300"), 1.23);
  assert.equal(formatTwoDecimals(10.1), "10,10");
  assert.equal(calculateDiscountedTotal(0.1, 20), 0.02);
});

test("today is a calendar day in the company's zone", () => {
  const day = getCurrentDateInTimezone("America/Costa_Rica");
  assert.equal(isDay(day), true);
  const shown = formatDate("2025-09-02", "America/Costa_Rica");
  assert.match(shown, /septiembre/);
  assert.equal(shown.includes(":"), false);
});

test("a cycle in a document is marked and does not throw", () => {
  const row: { name: string; self?: unknown } = { name: "a" };
  row.self = row;
  const parsed = JSON.parse(safeJsonStringify(row)) as { self: string };
  assert.equal(parsed.self, "[Circular]");
});
