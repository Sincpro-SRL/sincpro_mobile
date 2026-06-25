import { IMigration } from "@sincpro/mobile/domain/database";
import { DBCursor } from "@sincpro/mobile/infrastructure/database";

export enum DATABASE_TABLES {
  SETTINGS = "settings",
  EVENT_QUEUE = "event_queue",
  DEAD_LETTER_QUEUE = "dead_letter_queue",
  DOMAIN_EVENTS = "domain_events",
  DOMAIN_EVENTS_DEAD_LETTER = "domain_events_dead_letter",
  TELEMETRY_QUEUE = "telemetry_queue",
  SPANS_QUEUE = "spans_queue",
}

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

async function createDeadLetterQueueTable(): Promise<void> {
  await DBCursor.execAsync(`
    CREATE TABLE IF NOT EXISTS ${DATABASE_TABLES.DEAD_LETTER_QUEUE} (
      uuid TEXT PRIMARY KEY NOT NULL, -- UUID v7 for chronological ordering
      name TEXT NOT NULL,
      payload TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      error_message TEXT
    );
  `);
}

async function createEventQueueTable(): Promise<void> {
  await DBCursor.execAsync(`
    CREATE TABLE IF NOT EXISTS ${DATABASE_TABLES.EVENT_QUEUE}(
      uuid TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      payload TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      network_event INTEGER DEFAULT 0,
      aggregate_id TEXT DEFAULT NULL,
      sequence INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING',
      acknowledged_at TEXT DEFAULT NULL,
      error_message TEXT DEFAULT NULL
    );
  `);
}

async function createDomainEventsTable(): Promise<void> {
  await DBCursor.execAsync(`
    CREATE TABLE IF NOT EXISTS ${DATABASE_TABLES.DOMAIN_EVENTS} (
      uuid TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      label TEXT NOT NULL,
      data TEXT NOT NULL,
      requires_network INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      attempts INTEGER NOT NULL DEFAULT 0,
      error_message TEXT DEFAULT NULL,
      acknowledged_at TEXT DEFAULT NULL,
      failed_at TEXT DEFAULT NULL,
      aggregate_id TEXT DEFAULT NULL,
      source_id TEXT DEFAULT NULL,
      correlation_id TEXT DEFAULT NULL,
      sequence INTEGER NOT NULL DEFAULT 0
    );
  `);

  await DBCursor.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_domain_events_status ON ${DATABASE_TABLES.DOMAIN_EVENTS}(status);
  `);

  await DBCursor.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_domain_events_correlation ON ${DATABASE_TABLES.DOMAIN_EVENTS}(correlation_id);
  `);

  await DBCursor.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_domain_events_aggregate ON ${DATABASE_TABLES.DOMAIN_EVENTS}(aggregate_id);
  `);

  await DBCursor.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_domain_events_name ON ${DATABASE_TABLES.DOMAIN_EVENTS}(name);
  `);

  await DBCursor.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_domain_events_created ON ${DATABASE_TABLES.DOMAIN_EVENTS}(created_at);
  `);
}

async function createDomainEventsDeadLetterTable(): Promise<void> {
  await DBCursor.execAsync(`
    CREATE TABLE IF NOT EXISTS ${DATABASE_TABLES.DOMAIN_EVENTS_DEAD_LETTER} (
      uuid TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      label TEXT NOT NULL,
      data TEXT NOT NULL,
      requires_network INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      error_message TEXT DEFAULT NULL,
      failed_at TEXT NOT NULL,
      aggregate_id TEXT DEFAULT NULL,
      source_id TEXT DEFAULT NULL,
      correlation_id TEXT DEFAULT NULL,
      sequence INTEGER NOT NULL DEFAULT 0
    );
  `);

  await DBCursor.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_dead_letter_correlation ON ${DATABASE_TABLES.DOMAIN_EVENTS_DEAD_LETTER}(correlation_id);
  `);

  await DBCursor.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_dead_letter_name ON ${DATABASE_TABLES.DOMAIN_EVENTS_DEAD_LETTER}(name);
  `);

  await DBCursor.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_dead_letter_failed ON ${DATABASE_TABLES.DOMAIN_EVENTS_DEAD_LETTER}(failed_at);
  `);
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

const MIGRATIONS: IMigration[] = [
  { name: DATABASE_TABLES.SETTINGS, migrationFn: createSettingsTable },
  { name: DATABASE_TABLES.EVENT_QUEUE, migrationFn: createEventQueueTable },
  { name: DATABASE_TABLES.DEAD_LETTER_QUEUE, migrationFn: createDeadLetterQueueTable },
  { name: DATABASE_TABLES.DOMAIN_EVENTS, migrationFn: createDomainEventsTable },
  {
    name: DATABASE_TABLES.DOMAIN_EVENTS_DEAD_LETTER,
    migrationFn: createDomainEventsDeadLetterTable,
  },
  { name: DATABASE_TABLES.TELEMETRY_QUEUE, migrationFn: createTelemetryQueueTable },
  { name: DATABASE_TABLES.SPANS_QUEUE, migrationFn: createSpansQueueTable },
];

export default MIGRATIONS;
