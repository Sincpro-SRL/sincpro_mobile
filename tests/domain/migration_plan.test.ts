import assert from "node:assert/strict";
import test from "node:test";

import { type IMigration } from "../../sincpro_mobile/domain/database/database.ts";
import {
  applyMigrationStep,
  migrationsNewerThanApp,
  migrationTables,
  missingColumns,
  pendingMigrations,
  resetPlan,
} from "../../sincpro_mobile/domain/database/migration_plan.ts";

function migration(name: string, tables?: string[]): IMigration {
  return { name, tables, migrationFn: async () => undefined };
}

test("a migration runs once, in order, and a repeated name is skipped", () => {
  const migrations = [
    migration("settings"),
    migration("event_queue"),
    migration("event_queue"),
  ];
  const pending = pendingMigrations(migrations, new Set(["settings"]));
  assert.deepEqual(
    pending.map((item) => item.name),
    ["event_queue"],
  );
});

test("a wipe drops business tables, keeps telemetry, and forgets only what it dropped", () => {
  const migrations = [
    migration("event_queue"),
    migration("event_queue.add_status", ["event_queue"]),
    migration("telemetry_queue"),
    migration("not a table"),
  ];
  const plan = resetPlan(migrations, ["telemetry_queue"]);
  assert.deepEqual(plan.drop, ["event_queue"]);
  assert.deepEqual(plan.forget, ["event_queue", "event_queue.add_status"]);
});

test("a name that is not a table is not dropped unless it declares one", () => {
  assert.deepEqual(migrationTables(migration("event_queue.add_status")), []);
  assert.deepEqual(migrationTables(migration("event_queue.add_status", ["event_queue"])), [
    "event_queue",
  ]);
});

test("a database from a newer app is named before this app opens it", () => {
  assert.deepEqual(migrationsNewerThanApp(["settings", "future.column"], ["settings"]), [
    "future.column",
  ]);
});

test("a step commits its SQL and its name together", async () => {
  const log: string[] = [];
  await applyMigrationStep(
    {
      name: "notes",
      migrationFn: async () => {
        log.push("sql");
      },
    },
    async (work) => {
      log.push("begin");
      await work();
      log.push("commit");
    },
    async () => {
      log.push("mark");
    },
  );
  assert.deepEqual(log, ["begin", "sql", "mark", "commit"]);
});

test("a failed step does not mark and the transaction does not commit", async () => {
  const log: string[] = [];
  await assert.rejects(() =>
    applyMigrationStep(
      {
        name: "notes",
        migrationFn: async () => {
          log.push("sql");
          throw new Error("disk");
        },
      },
      async (work) => {
        log.push("begin");
        try {
          await work();
          log.push("commit");
        } catch (error) {
          log.push("rollback");
          throw error;
        }
      },
      async () => {
        log.push("mark");
      },
    ),
  );
  assert.deepEqual(log, ["begin", "sql", "rollback"]);
});

test("a document table gains the columns it does not have yet", () => {
  const missing = missingColumns(
    ["uuid", "data"],
    [
      { name: "version", definition: "INTEGER NOT NULL DEFAULT 1" },
      { name: "data", definition: "TEXT NOT NULL DEFAULT '{}'" },
      { name: "name", definition: "TEXT" },
    ],
  );
  assert.deepEqual(
    missing.map((column) => column.name),
    ["version", "name"],
  );
});
