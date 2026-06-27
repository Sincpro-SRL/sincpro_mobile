// Main entry point — public facade for framework consumers
export { Tracing } from "./tracing_facade";

// Initialization
export { initTelemetry } from "./init_telemetry";

// Shared types
export type {
  BufferStats,
  FlushConfig,
  LokiAuth,
  LokiConfig,
  OtlpConfig,
  TelemetryBufferStats,
  TelemetryConfig,
} from "./types";

// Buffer observability
export { bufferStats } from "./buffer_registry";

// Logging
export type { LogEntry } from "./logging/log_queue_repository";
export { LogQueueRepository } from "./logging/log_queue_repository";
export { LokiClient } from "./logging/loki_client";
export { getLokiClient } from "./logging/loki_registry";

// Tracing
export { activeTraceLabel, getActiveSpanContext } from "./tracing/active_span";
export { OtlpClient } from "./tracing/otlp_client";
export type { OtlpExportRequest } from "./tracing/otlp_serializer";
export { serializeToOtlp } from "./tracing/otlp_serializer";
export type { SpanInput, SpanRow } from "./tracing/span_queue_repository";
export { SpanQueueRepository } from "./tracing/span_queue_repository";
export { SQLiteSpanExporter } from "./tracing/sqlite_span_exporter";
export { getTracer } from "./tracing/tracer";
export { tracingHooks } from "./tracing/tracing_hooks";
