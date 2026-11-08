import assert from "node:assert/strict";
import test from "node:test";

import { DomainEventRepository } from "../../sincpro_mobile/adapters/repositories/domain_event.repository.ts";
import { EEventStatus } from "../../sincpro_mobile/domain/events/index.ts";
import { DBCursor } from "../../sincpro_mobile/infrastructure/database/index.ts";
import { eventService } from "../../sincpro_mobile/services/event.service.ts";

type Call = { sql: string; params: unknown[] };

function capture(method: "getAllAsync" | "mutateDatabase") {
  const calls: Call[] = [];
  const cursor = DBCursor as unknown as Record<string, (...args: unknown[]) => unknown>;
  const original = cursor[method];
  cursor[method] = async (sql: unknown, ...params: unknown[]) => {
    calls.push({ sql: String(sql), params });
    return method === "getAllAsync" ? [] : { changes: 0, lastInsertRowId: 0 };
  };
  return { calls, restore: () => (cursor[method] = original) };
}

test("the events list is bounded in SQL, newest first", async () => {
  const { calls, restore } = capture("getAllAsync");
  try {
    await eventService.listRecentEvents();
  } finally {
    restore();
  }
  assert.match(calls[0].sql, /ORDER BY created_at DESC\s+LIMIT \?/);
  assert.deepEqual(calls[0].params, [500]);
});

test("retention deletes only acknowledged events older than the window", async () => {
  const { calls, restore } = capture("mutateDatabase");
  const before = Date.now();
  try {
    await eventService.pruneHistory(7);
  } finally {
    restore();
  }
  assert.match(calls[0].sql, /DELETE FROM .* WHERE status = \? AND created_at < \?/);
  const [status, cutoff] = calls[0].params as [string, string];
  assert.equal(status, EEventStatus.ACKNOWLEDGED);
  const expected = before - 7 * 24 * 60 * 60 * 1000;
  assert.ok(Math.abs(Date.parse(cutoff) - expected) < 5000, `cutoff ${cutoff}`);
});

test("pending and failed events are never pruned by retention", async () => {
  const { calls, restore } = capture("mutateDatabase");
  try {
    await DomainEventRepository.removeAcknowledgedBefore("2026-01-01T00:00:00.000Z");
  } finally {
    restore();
  }
  assert.deepEqual(calls[0].params, [EEventStatus.ACKNOWLEDGED, "2026-01-01T00:00:00.000Z"]);
});
