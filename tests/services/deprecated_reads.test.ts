import assert from "node:assert/strict";
import { before, test } from "node:test";

import { configureProcess } from "@sincpro/client-framework";
import { type MemoryLogger, memoryLogger } from "@sincpro/client-framework/testing";

import { eventStore } from "../../sincpro_mobile/adapters/repositories/sqlite_event_store.ts";
import MIGRATIONS from "../../sincpro_mobile/entrypoints/db/migrations.ts";
import {
  CommandListFailedEvents,
  CommandListRecentEvents,
  commonBoundedContext,
} from "../../sincpro_mobile/services/index.ts";

let logs: MemoryLogger;

before(async () => {
  for (const name of ["stored_events", "stored_events_labels"]) {
    await MIGRATIONS.find((one) => one.name === name)?.migrationFn();
  }
  logs = memoryLogger();
  configureProcess({ logger: { engine: logs } });
  for (let index = 0; index < 530; index++) {
    await eventStore.add({
      kind: "event",
      answer: null,
      envelope: {
        name: "shop.print.v1.requested",
        id: `e-${String(index).padStart(4, "0")}`,
        correlationId: `e-${index}`,
        causationId: null,
        publishedAt: new Date(2026, 0, 1, 0, 0, index).toISOString(),
      },
      payload: {},
      state: index % 10 === 0 ? "delivered" : "set_aside",
      attempts: 1,
      retryAt: null,
      reached: [],
      failures: [],
    });
  }
});

test("the deprecated failed list still answers every failed event, past one page, and says to move", async () => {
  const failed = await commonBoundedContext.execute(new CommandListFailedEvents());
  await commonBoundedContext.execute(new CommandListFailedEvents());

  assert.equal(failed.length, 477);
  assert.equal(failed[0].id, "e-0529");
  assert.ok(failed.every((record) => record.state === "set_aside"));
  const warnings = logs.records.filter((record) =>
    record.message.includes("CommandListFailedEvents is deprecated"),
  );
  assert.equal(warnings.length, 1, "said once, not on every read");
});

test("the deprecated recent list is the first page of the search", async () => {
  const recent = await commonBoundedContext.execute(new CommandListRecentEvents(3));

  assert.deepEqual(
    recent.map((record) => record.id),
    ["e-0529", "e-0528", "e-0527"],
  );
});
