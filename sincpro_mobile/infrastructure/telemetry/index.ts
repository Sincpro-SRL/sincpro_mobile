// Main entry point — public facade for framework consumers
export { Tracing } from "./tracing_facade.ts";

// Initialization
export { initTelemetry } from "./init_telemetry.ts";

// Shared types
export type {
  BufferStats,
  FlushConfig,
  LokiAuth,
  LokiConfig,
  OtlpConfig,
  TelemetryBufferStats,
  TelemetryConfig,
} from "./types.ts";

// Buffer observability
export { bufferStats } from "./buffer_registry.ts";

// Logging
export type { LogEntry } from "./logging/log_queue_repository.ts";
export { LogQueueRepository } from "./logging/log_queue_repository.ts";
export { LokiClient } from "./logging/loki_client.ts";
export { getLokiClient } from "./logging/loki_registry.ts";

// Tracing
export { activeTraceLabel, getActiveSpanContext } from "./tracing/active_span.ts";
export { OtlpClient } from "./tracing/otlp_client.ts";
export type { OtlpExportRequest } from "./tracing/otlp_serializer.ts";
export { serializeToOtlp } from "./tracing/otlp_serializer.ts";
export type { SpanInput, SpanRow } from "./tracing/span_queue_repository.ts";
export { SpanQueueRepository } from "./tracing/span_queue_repository.ts";
export { SQLiteSpanExporter } from "./tracing/sqlite_span_exporter.ts";
export { getTracer } from "./tracing/tracer.ts";
export { tracingHooks } from "./tracing/tracing_hooks.ts";
