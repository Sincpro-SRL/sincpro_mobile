import type { SpanRow } from "./span_queue_repository";

// ---------------------------------------------------------------------------
// OTLP attribute value — one-of encoding per OTLP/JSON spec
// ---------------------------------------------------------------------------

type OtlpAnyValue =
  | { stringValue: string }
  | { intValue: string }
  | { doubleValue: number }
  | { boolValue: boolean };

interface OtlpKeyValue {
  key: string;
  value: OtlpAnyValue;
}

function encodeValue(v: unknown): OtlpAnyValue {
  if (typeof v === "string") return { stringValue: v };
  // intValue is a string in OTLP/JSON (uint64 can exceed JS Number precision)
  if (typeof v === "number" && Number.isInteger(v)) return { intValue: String(v) };
  if (typeof v === "number") return { doubleValue: v };
  if (typeof v === "boolean") return { boolValue: v };
  return { stringValue: String(v) };
}

function encodeAttrs(json: string): OtlpKeyValue[] {
  try {
    const obj = JSON.parse(json) as Record<string, unknown>;
    return Object.entries(obj).map(([key, value]) => ({ key, value: encodeValue(value) }));
  } catch {
    return [];
  }
}

function parseEvents(json: string): OtlpEvent[] {
  try {
    const raw = JSON.parse(json) as {
      name: string;
      timeUnixNano: string;
      attributes: Record<string, unknown>;
    }[];
    return raw.map((e) => ({
      name: e.name,
      timeUnixNano: e.timeUnixNano,
      attributes: Object.entries(e.attributes ?? {}).map(([key, value]) => ({
        key,
        value: encodeValue(value),
      })),
    }));
  } catch {
    return [];
  }
}

function parseLinks(json: string): OtlpLink[] {
  try {
    const raw = JSON.parse(json) as {
      traceId: string;
      spanId: string;
      attributes: Record<string, unknown>;
    }[];
    return raw.map((l) => ({
      traceId: l.traceId,
      spanId: l.spanId,
      attributes: Object.entries(l.attributes ?? {}).map(([key, value]) => ({
        key,
        value: encodeValue(value),
      })),
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// OTLP span / scopeSpans / resourceSpans types
// ---------------------------------------------------------------------------

interface OtlpEvent {
  name: string;
  timeUnixNano: string;
  attributes: OtlpKeyValue[];
}

interface OtlpLink {
  traceId: string;
  spanId: string;
  attributes: OtlpKeyValue[];
}

interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpKeyValue[];
  events: OtlpEvent[];
  links: OtlpLink[];
  status: { code: number; message?: string };
}

interface OtlpScopeSpans {
  scope: { name: string };
  spans: OtlpSpan[];
}

interface OtlpResourceSpans {
  resource: { attributes: OtlpKeyValue[] };
  scopeSpans: OtlpScopeSpans[];
}

export interface OtlpExportRequest {
  resourceSpans: OtlpResourceSpans[];
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

/**
 * Converts a batch of SpanRows (from SQLite) into an OTLP/HTTP JSON payload.
 *
 * Grouping strategy: spans sharing the same `resource_attrs` JSON are placed
 * under the same ResourceSpans entry. All spans are placed under a single
 * scope named "@sincpro/mobile".
 *
 * traceId and spanId are hex strings — OTLP/JSON uses hex (not base64).
 * Timestamps are nanosecond strings — already stored that way in SQLite.
 */
export function serializeToOtlp(spans: SpanRow[]): OtlpExportRequest {
  // Group by resource_attrs to minimize payload size
  const byResource = new Map<string, SpanRow[]>();
  for (const span of spans) {
    const key = span.resource_attrs;
    const group = byResource.get(key) ?? [];
    group.push(span);
    byResource.set(key, group);
  }

  const resourceSpans: OtlpResourceSpans[] = [];

  for (const [resourceJson, group] of byResource) {
    const otlpSpans: OtlpSpan[] = group.map((s) => {
      const span: OtlpSpan = {
        traceId: s.trace_id,
        spanId: s.span_id,
        name: s.name,
        kind: s.kind,
        startTimeUnixNano: s.start_time_unixnano,
        endTimeUnixNano: s.end_time_unixnano,
        attributes: encodeAttrs(s.attributes),
        events: parseEvents(s.events ?? "[]"),
        links: parseLinks(s.links ?? "[]"),
        status: { code: s.status_code, message: s.status_message || undefined },
      };
      if (s.parent_span_id) span.parentSpanId = s.parent_span_id;
      return span;
    });

    resourceSpans.push({
      resource: { attributes: encodeAttrs(resourceJson) },
      scopeSpans: [{ scope: { name: "@sincpro/mobile" }, spans: otlpSpans }],
    });
  }

  return { resourceSpans };
}
