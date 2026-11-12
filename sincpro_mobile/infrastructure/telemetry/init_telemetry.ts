import { DBCursor } from "@sincpro/mobile/infrastructure/database";

import { _registerBuffers, bufferStats } from "./buffer_registry";
import { ConnectivityState } from "./connectivity_state";
import { FlushTelemetry } from "./flush_telemetry";
import { LogQueueRepository } from "./logging/log_queue_repository";
import { LokiClient } from "./logging/loki_client";
import { _resetLogShipping, initLogShipping } from "./logging/loki_registry";
import { TelemetryFlushWorker } from "./telemetry_flush_worker";
import { TelemetrySignal } from "./telemetry_signal";
import { OtlpClient } from "./tracing/otlp_client";
import {
  EVICT_CHECK_EVERY,
  MAX_SPANS_QUEUE_BYTES,
  MAX_SPANS_QUEUE_SIZE,
  SpanQueueRepository,
} from "./tracing/span_queue_repository";
import { SpanSampler } from "./tracing/span_sampler";
import { initTracing } from "./tracing/tracer";
import type { TelemetryConfig } from "./types";

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
export interface InitTelemetryOptions {
  /**
   * Register the background flush with the OS scheduler. False when the OS itself
   * woke the app to run that task: registering it again from there is pointless.
   */
  scheduleBackground?: boolean;
}

export async function initTelemetry(
  config: TelemetryConfig,
  { scheduleBackground = true }: InitTelemetryOptions = {},
): Promise<void> {
  // Tear down the previous worker before re-wiring (hot-reload / config change).
  // Awaited so the old background task is unregistered before we register a new
  // one under the same task name.
  await _worker?.stop().catch(() => {});
  _worker = null;

  const connectivity = new ConnectivityState();
  const timeoutMs = config.flush?.sendTimeoutMs;

  // Logs — stored first, then sent in batches by the flush, as spans are.
  const logQueue = config.loki ? new LogQueueRepository(DBCursor) : null;
  const logClient = config.loki ? new LokiClient(config.loki, timeoutMs) : null;

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

  // Every line is stored, then the same signal schedules one batch.
  if (logQueue) initLogShipping(logQueue, () => signal.notify());
  else _resetLogShipping();

  // Register the TracerProvider; persist spans (and fire the signal) only when
  // an OTLP destination is configured.
  initTracing(spanQueue, !!config.otlp, () => signal.notify(), {
    serviceName: config.serviceName,
    serviceVersion: config.serviceVersion,
    deploymentEnvironment: config.deploymentEnvironment,
    extra: config.resourceAttributes,
  });

  _worker = new TelemetryFlushWorker(flush, signal, connectivity, {
    backgroundIntervalMin: scheduleBackground ? config.flush?.backgroundIntervalMin : 0,
    onConnectivityEvents: config.flush?.onConnectivityEvents,
  });
  _worker.start();

  // Expose buffer pressure for health checks / dashboards.
  _registerBuffers(logQueue, spanQueue);
}

/**
 * Sends what is waiting now — a fatal error's line before the app closes, a report a person
 * asked to send —, without waiting for the batch; nothing when telemetry did not start.
 */
export async function deliverTelemetryNow(): Promise<void> {
  await _worker?.flushNow();
}

/**
 * Telemetry as the core's use cases send it (`TelemetryDelivery`): delivered now, answering how
 * many lines and spans still wait (offline), or `null` when this build sends none.
 */
export const telemetryDelivery = {
  async deliverNow(): Promise<number | null> {
    if (!_worker) return null;
    await _worker.flushNow();
    const { logs, spans } = await bufferStats();
    return (logs?.rows ?? 0) + (spans?.rows ?? 0);
  },
};

/**
 * One delivery run for the OS background task. Reuses the pipeline the app already
 * started in this JS context; in a context the OS woke without UI it starts telemetry
 * first, without scheduling the background task again.
 */
export async function runBackgroundTelemetryFlush(config: TelemetryConfig): Promise<void> {
  if (!_worker) await initTelemetry(config, { scheduleBackground: false });
  await _worker?.flushNow();
}
