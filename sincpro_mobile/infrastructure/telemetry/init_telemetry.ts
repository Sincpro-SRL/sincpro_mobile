import { DBCursor } from "@sincpro/mobile/infrastructure/database";

import { _registerBuffers } from "./buffer_registry.ts";
import { ConnectivityState } from "./connectivity_state.ts";
import { FlushTelemetry } from "./flush_telemetry.ts";
import { LogQueueRepository } from "./logging/log_queue_repository.ts";
import { _resetLokiClient, getLokiClient, initLokiClient } from "./logging/loki_registry.ts";
import { TelemetryFlushWorker } from "./telemetry_flush_worker.ts";
import { TelemetrySignal } from "./telemetry_signal.ts";
import { OtlpClient } from "./tracing/otlp_client.ts";
import {
  EVICT_CHECK_EVERY,
  MAX_SPANS_QUEUE_BYTES,
  MAX_SPANS_QUEUE_SIZE,
  SpanQueueRepository,
} from "./tracing/span_queue_repository.ts";
import { SpanSampler } from "./tracing/span_sampler.ts";
import { initTracing } from "./tracing/tracer.ts";
import type { TelemetryConfig } from "./types.ts";

let _worker: TelemetryFlushWorker | null = null;

/**
 * Initializes telemetry with offline-first delivery.
 *
 * Delivery is event-driven, not a fixed timer:
 * - Producing telemetry schedules a debounced flush (the primary trigger).
 * - A single {@link FlushTelemetry} use case drains BOTH the log and span
 *   queues, gated by a self-correcting connectivity flag + HTTP send timeout.
 * - Optional triggers (none required): reconnect events drain the backlog
 *   immediately; a long-interval background cron probes as a safety net.
 *
 * Spans always buffer to SQLite only when an OTLP destination is configured;
 * the TracerProvider is registered regardless so `@Trace`/`withSpan` work.
 *
 * Idempotent: safe to call again (hot-reload, config change). The previous
 * worker (signal + events + cron) is fully torn down — awaited — before the new
 * one registers, so the shared background task name is never double-registered.
 *
 * Call once at app startup after migrations have run (`createApp` handles this).
 */
export async function initTelemetry(config: TelemetryConfig): Promise<void> {
  // Tear down the previous worker before re-wiring (hot-reload / config change).
  // Awaited so the old background task is unregistered before we register a new
  // one under the same task name.
  await _worker?.stop().catch(() => {});
  _worker = null;

  const connectivity = new ConnectivityState();
  const timeoutMs = config.flush?.sendTimeoutMs;

  // Logs — opportunistic push (with fallback to SQLite) + batch drain on flush.
  let logQueue: LogQueueRepository | null = null;
  if (config.loki) {
    logQueue = new LogQueueRepository(DBCursor);
    initLokiClient(config.loki, logQueue, timeoutMs);
  } else {
    // Drop a stale client from a previous init that had Loki configured.
    _resetLokiClient();
  }
  const logClient = config.loki ? getLokiClient() : null;

  // Spans — always buffered to SQLite; OTLP client only when a destination exists.
  // Head sampling (default on) drops whole traces at ingest once the buffer is
  // near full, so sustained offline pressure degrades gracefully instead of
  // thrashing insert→evict.
  const spanQueue = new SpanQueueRepository(
    DBCursor,
    MAX_SPANS_QUEUE_SIZE,
    MAX_SPANS_QUEUE_BYTES,
    EVICT_CHECK_EVERY,
    new SpanSampler(),
  );
  const spanClient = config.otlp ? new OtlpClient(config.otlp, timeoutMs) : null;

  // The single delivery use case — all triggers funnel here.
  const flush = new FlushTelemetry({
    connectivity,
    logClient,
    logQueue,
    spanClient,
    spanQueue,
  });

  // Production signal: producing telemetry schedules a debounced flush.
  const signal = new TelemetrySignal(() => {
    flush.run().catch(() => {});
  }, config.flush?.debounceMs);

  // Register the TracerProvider; persist spans (and fire the signal) only when
  // an OTLP destination is configured.
  initTracing(spanQueue, !!config.otlp, () => signal.notify(), {
    serviceName: config.serviceName,
    serviceVersion: config.serviceVersion,
    deploymentEnvironment: config.deploymentEnvironment,
    extra: config.resourceAttributes,
  });

  _worker = new TelemetryFlushWorker(flush, signal, connectivity, {
    backgroundIntervalMin: config.flush?.backgroundIntervalMin,
    onConnectivityEvents: config.flush?.onConnectivityEvents,
  });
  _worker.start();

  // Expose buffer pressure for health checks / dashboards.
  _registerBuffers(logQueue, spanQueue);
}
