import type { LokiConfig } from "../types";
import type { LogQueueRepository } from "./log_queue_repository";
import { LokiClient } from "./loki_client";

let _client: LokiClient | null = null;

/**
 * Low-level client initializer. Prefer `initTelemetry` from the telemetry index, which also
 * wires the SQLite outbox and the flush cron. Use this directly only in tests.
 */
export function initLokiClient(
  config: LokiConfig,
  queue?: LogQueueRepository,
  timeoutMs?: number,
): void {
  _client = new LokiClient(config, queue, timeoutMs);
}

/** Returns the active LokiClient, or null if telemetry was not initialized. */
export function getLokiClient(): LokiClient | null {
  return _client;
}

/** @internal — test use only */
export function _resetLokiClient(): void {
  _client = null;
}
