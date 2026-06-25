import { DBCursor } from "@sincpro/mobile/infrastructure/database";

import { getLokiClient, initTelemetry as _initClient, type TelemetryConfig } from "./config";
import { TelemetryFlushCron } from "./flush_cron";
import { TelemetryQueueRepository } from "./queue_repository";

export type { LokiAuth, LokiConfig, TelemetryConfig } from "./config";
export { getLokiClient, LokiClient } from "./config";
export { TelemetryFlushCron } from "./flush_cron";
export type { OutboxEntry } from "./queue_repository";
export { TelemetryQueueRepository } from "./queue_repository";

let _flushCron: TelemetryFlushCron | null = null;

/**
 * Initializes telemetry with offline-first delivery: creates the SQLite queue,
 * wires it into the Loki client, and starts the 1-minute flush cron.
 * Call once at app startup after migrations have run.
 */
export function initTelemetry(config: TelemetryConfig): void {
  const queue = new TelemetryQueueRepository(DBCursor);
  _initClient(config, queue);
  _flushCron?.stop().catch(() => {});
  _flushCron = new TelemetryFlushCron(getLokiClient()!, queue);
  _flushCron.start().catch(() => {});
}
