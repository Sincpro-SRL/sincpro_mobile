import type { SpanInput } from "./span_queue_repository.ts";

/**
 * OTel HrTime: [seconds: number, nanoseconds: number].
 * BigInt required — seconds alone can be ~1.7e9, multiplied by 1e9 = 1.7e18,
 * which exceeds Number.MAX_SAFE_INTEGER (~9e15).
 */
export function hrTimeToNanoString(hrTime: [number, number]): string {
  return String(BigInt(hrTime[0]) * 1_000_000_000n + BigInt(hrTime[1]));
}

/**
 * Minimal shape of OTel ReadableSpan needed for serialization.
 * Using a local interface instead of importing from sdk-trace-base so this
 * module stays importable in the Node test runner (OTel packages are CJS).
 */
export interface SerializableSpan {
  name: string;
  kind: number;
  spanContext(): { traceId: string; spanId: string };
  parentSpanContext?: { spanId: string } | undefined;
  startTime: [number, number];
  endTime: [number, number];
  attributes: Record<string, unknown>;
  status: { code: number; message?: string };
  resource?: { attributes: Record<string, unknown> };
}

export function serializeSpan(span: SerializableSpan): SpanInput {
  const ctx = span.spanContext();
  return {
    trace_id: ctx.traceId,
    span_id: ctx.spanId,
    parent_span_id: span.parentSpanContext?.spanId ?? null,
    name: span.name,
    kind: span.kind,
    start_time_unixnano: hrTimeToNanoString(span.startTime),
    end_time_unixnano: hrTimeToNanoString(span.endTime),
    attributes: JSON.stringify(span.attributes ?? {}),
    status_code: span.status.code,
    status_message: span.status.message ?? "",
    resource_attrs: JSON.stringify(span.resource?.attributes ?? {}),
  };
}
