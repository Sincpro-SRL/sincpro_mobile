import type { LogQueueRepository } from "./logging/log_queue_repository.ts";
import type { SpanQueueRepository } from "./tracing/span_queue_repository.ts";
import type { TelemetryBufferStats } from "./types.ts";

let _logQueue: LogQueueRepository | null = null;
let _spanQueue: SpanQueueRepository | null = null;

/** @internal — wired by initTelemetry so consumers can inspect buffer pressure. */
export function _registerBuffers(
  logQueue: LogQueueRepository | null,
  spanQueue: SpanQueueRepository | null,
): void {
  _logQueue = logQueue;
  _spanQueue = spanQueue;
}

/** @internal — test use only. */
export function _resetBuffers(): void {
  _logQueue = null;
  _spanQueue = null;
}

/**
 * Current size and drop pressure of the telemetry buffers.
 *
 * Use this to surface offline backlog in dashboards or health checks — a high
 * `dropped` count means the device has been offline long enough to lose data.
 * Returns null buffers when the corresponding signal is disabled.
 */
export async function bufferStats(): Promise<TelemetryBufferStats> {
  const [logs, spans] = await Promise.all([
    _logQueue?.stats() ?? Promise.resolve(null),
    _spanQueue?.stats() ?? Promise.resolve(null),
  ]);
  return { logs, spans };
}
