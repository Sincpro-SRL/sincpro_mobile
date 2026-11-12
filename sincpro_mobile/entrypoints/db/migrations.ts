import { IMigration } from "@sincpro/mobile/domain/database";
import { addColumnIfMissing, DBCursor } from "@sincpro/mobile/infrastructure/database";

export enum DATABASE_TABLES {
  SETTINGS = "settings",
  STORED_EVENTS = "stored_events",
  TELEMETRY_QUEUE = "telemetry_queue",
  SPANS_QUEUE = "spans_queue",
}

/**
 * The tables of the event bus before 2.0. Their migrations keep their names — a device that
 * applied them must still know them — and create nothing now: `stored_events` moves their rows
 * and drops them.
 */
const RETIRED_TABLES = [
  "event_queue",
  "dead_letter_queue",
  "domain_events",
  "domain_events_dead_letter",
] as const;

async function createSettingsTable(): Promise<void> {
  await DBCursor.execAsync(`
    CREATE TABLE IF NOT EXISTS ${DATABASE_TABLES.SETTINGS}(
      name TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      type TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function retired(): Promise<void> {}

/** The envelope fields the bus wrote into an event's JSON before 2.0: not part of its values. */
const RETIRED_ENVELOPE_KEYS = [
  "name",
  "id",
  "label",
  "created_at",
  "entity_type",
  "entity_id",
  "correlation_id",
  "causation_id",
  "entity_version",
  "sequence",
  "traceparent",
]
  .map((key) => `'$.${key}'`)
  .join(", ");

async function existingTables(names: readonly string[]): Promise<Set<string>> {
  const rows = await DBCursor.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${names.map(() => "?").join(", ")})`,
    ...names,
  );
  return new Set(rows.map((row) => row.name));
}

/**
 * The stored queue's table (`SqliteEventStore`), and the bus's rows moved into it — nothing is
 * lost:
 *
 * 1. `stored_events`: one row per event, in the order added (`seq`).
 * 2. `domain_events`, oldest first: PENDING and PROCESSING wait again (`pending`), ACKNOWLEDGED is
 *    `delivered`, FAILED and CANCELLED are `set_aside` with their error as the failure. Ids,
 *    correlation, causation, attempts and the event's values are kept; the envelope fields the
 *    bus wrote inside the JSON are taken out of the values.
 * 3. `domain_events_dead_letter`: `set_aside`, unless the same id was already moved.
 * Final: the bus's tables dropped.
 */
async function createStoredMessagesTable(): Promise<void> {
  const table = DATABASE_TABLES.STORED_EVENTS;
  await DBCursor.execAsync(`
    CREATE TABLE IF NOT EXISTS ${table} (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL DEFAULT 'event',
      name TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      causation_id TEXT DEFAULT NULL,
      published_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      state TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      retry_at TEXT DEFAULT NULL,
      reached TEXT NOT NULL DEFAULT '[]',
      failures TEXT NOT NULL DEFAULT '[]',
      settled_at TEXT DEFAULT NULL,
      answer TEXT DEFAULT NULL,
      label TEXT DEFAULT NULL,
      label_key TEXT DEFAULT NULL
    );
  `);
  await DBCursor.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_stored_events_state ON ${table}(state, seq);`,
  );
  await DBCursor.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_stored_events_correlation ON ${table}(correlation_id);`,
  );
  await DBCursor.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_stored_events_name ON ${table}(name);`,
  );

  const present = await existingTables(RETIRED_TABLES);
  const values = `CASE WHEN json_valid(data) THEN json_remove(data, ${RETIRED_ENVELOPE_KEYS}) ELSE '{}' END`;
  const causation = `CASE WHEN json_valid(data) THEN json_extract(data, '$.causation_id') END`;
  const failure = (message: string) =>
    `json_array(json_object('boundedContext', '', 'kind', 'internal', 'reason', 'FAILED_BEFORE_2_0', 'message', ${message}))`;
  const columns =
    "id, name, correlation_id, causation_id, published_at, payload, state, attempts, retry_at, reached, failures, settled_at";

  if (present.has("domain_events")) {
    await DBCursor.execAsync(`
      INSERT OR IGNORE INTO ${table} (${columns})
      SELECT uuid, name, COALESCE(correlation_id, uuid), ${causation}, created_at,
        ${values},
        CASE status
          WHEN 'ACKNOWLEDGED' THEN 'delivered'
          WHEN 'FAILED' THEN 'set_aside'
          WHEN 'CANCELLED' THEN 'set_aside'
          ELSE 'pending'
        END,
        attempts, NULL, '[]',
        CASE WHEN status IN ('FAILED', 'CANCELLED')
          THEN ${failure("COALESCE(error_message, status)")}
          ELSE '[]'
        END,
        CASE status WHEN 'ACKNOWLEDGED' THEN acknowledged_at WHEN 'FAILED' THEN failed_at END
      FROM domain_events
      ORDER BY created_at ASC, sequence ASC;
    `);
  }
  if (present.has("domain_events_dead_letter")) {
    await DBCursor.execAsync(`
      INSERT OR IGNORE INTO ${table} (${columns})
      SELECT uuid, name, COALESCE(correlation_id, uuid), ${causation}, created_at,
        ${values}, 'set_aside', attempts, NULL, '[]',
        ${failure("COALESCE(error_message, 'FAILED')")}, failed_at
      FROM domain_events_dead_letter
      ORDER BY failed_at ASC;
    `);
  }
  for (const retiredTable of present) {
    await DBCursor.execAsync(`DROP TABLE IF EXISTS ${retiredTable};`);
  }
}

async function createTelemetryQueueTable(): Promise<void> {
  await DBCursor.execAsync(`
    CREATE TABLE IF NOT EXISTS ${DATABASE_TABLES.TELEMETRY_QUEUE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await DBCursor.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_telemetry_queue_created
    ON ${DATABASE_TABLES.TELEMETRY_QUEUE}(created_at);
  `);
}

async function createSpansQueueTable(): Promise<void> {
  await DBCursor.execAsync(`
    CREATE TABLE IF NOT EXISTS ${DATABASE_TABLES.SPANS_QUEUE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trace_id TEXT NOT NULL,
      span_id TEXT NOT NULL,
      parent_span_id TEXT,
      name TEXT NOT NULL,
      kind INTEGER NOT NULL DEFAULT 0,
      start_time_unixnano TEXT NOT NULL,
      end_time_unixnano TEXT NOT NULL,
      attributes TEXT NOT NULL DEFAULT '{}',
      status_code INTEGER NOT NULL DEFAULT 0,
      status_message TEXT NOT NULL DEFAULT '',
      resource_attrs TEXT NOT NULL DEFAULT '{}',
      events TEXT NOT NULL DEFAULT '[]',
      links TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await DBCursor.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_spans_queue_created
    ON ${DATABASE_TABLES.SPANS_QUEUE}(created_at);
  `);

  await DBCursor.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_spans_queue_trace
    ON ${DATABASE_TABLES.SPANS_QUEUE}(trace_id);
  `);
}

/**
 * The stored queue carries Commands too: what a message is (`kind`, an event unless said) and
 * what a Command answered (`answer`). A table created before has neither; one created after
 * already does — adding them is a no-op.
 */
async function addMessageColumns(): Promise<void> {
  const table = DATABASE_TABLES.STORED_EVENTS;
  await addColumnIfMissing(table, "kind", "TEXT NOT NULL DEFAULT 'event'");
  await addColumnIfMissing(table, "answer", "TEXT DEFAULT NULL");
}

/**
 * A stored message keeps the label its class gave it when it was queued — what the screens show
 * and search, even when the module that names it is not active — and that label as a person
 * searches it (`label_key`: lower case, without accents). A message queued before is labelled
 * by its name.
 */
async function addLabelColumns(): Promise<void> {
  const table = DATABASE_TABLES.STORED_EVENTS;
  await addColumnIfMissing(table, "label", "TEXT DEFAULT NULL");
  await addColumnIfMissing(table, "label_key", "TEXT DEFAULT NULL");
  await DBCursor.execAsync(
    `UPDATE ${table} SET label = name, label_key = lower(name) WHERE label IS NULL`,
  );
}

function migration(name: string, migrationFn: () => Promise<void>): IMigration {
  return { name, tables: [name], migrationFn };
}

const MIGRATIONS: IMigration[] = [
  migration(DATABASE_TABLES.SETTINGS, createSettingsTable),
  ...RETIRED_TABLES.map((table) => migration(table, retired)),
  migration(DATABASE_TABLES.TELEMETRY_QUEUE, createTelemetryQueueTable),
  migration(DATABASE_TABLES.SPANS_QUEUE, createSpansQueueTable),
  migration(DATABASE_TABLES.STORED_EVENTS, createStoredMessagesTable),
  {
    name: "stored_events_messages",
    tables: [DATABASE_TABLES.STORED_EVENTS],
    migrationFn: addMessageColumns,
  },
  {
    name: "stored_events_labels",
    tables: [DATABASE_TABLES.STORED_EVENTS],
    migrationFn: addLabelColumns,
  },
];

export default MIGRATIONS;
