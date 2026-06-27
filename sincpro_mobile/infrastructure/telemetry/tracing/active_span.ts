import type { SpanContext } from "@opentelemetry/api";
import { trace } from "@opentelemetry/api";

import { _getContextManager } from "../../context_manager/index";
import { OTEL_CTX_KEY } from "../context_keys";

/**
 * Returns the SpanContext (traceId + spanId + traceFlags) of the span
 * currently active in the framework context, or null if no span is active.
 *
 * Use this to correlate logs with traces — inject traceId/spanId into log
 * lines so Grafana can link from Loki to Tempo automatically.
 *
 * @example
 * const span = getActiveSpanContext();
 * logger.info(`payment processed trace_id=${span?.traceId ?? "-"}`);
 */
export function getActiveSpanContext(): SpanContext | null {
  const otelCtx = _getContextManager().active().get(OTEL_CTX_KEY);
  if (!otelCtx) return null;
  const span = trace.getSpan(otelCtx);
  if (!span) return null;
  const ctx = span.spanContext();
  // A NonRecordingSpan has a valid-looking spanContext but isRemote/sampled may
  // differ. We only return it if the span is actually recording (sampled).
  return span.isRecording() ? ctx : null;
}

/**
 * Formats the active trace context as a log suffix ready to append to any
 * log line. Returns an empty string when no span is active so callers don't
 * need to branch.
 *
 * Output: " trace_id=<id> span_id=<id>"
 * Grafana Derived Fields can extract these and link to Tempo automatically.
 */
export function activeTraceLabel(): string {
  const ctx = getActiveSpanContext();
  if (!ctx) return "";
  return ` trace_id=${ctx.traceId} span_id=${ctx.spanId}`;
}
