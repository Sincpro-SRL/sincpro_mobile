import assert from "node:assert/strict";
import test from "node:test";

import { serializeToOtlp } from "../../sincpro_mobile/infrastructure/telemetry/tracing/otlp_serializer.ts";
import type { SpanRow } from "../../sincpro_mobile/infrastructure/telemetry/tracing/span_queue_repository.ts";

function makeRow(overrides: Partial<SpanRow> = {}): SpanRow {
  return {
    id: 1,
    trace_id: "aaaabbbbccccdddd0000111122223333",
    span_id: "aabbccdd11223344",
    parent_span_id: null,
    name: "HTTP GET /orders",
    kind: 3,
    start_time_unixnano: "1750000000000000000",
    end_time_unixnano: "1750000000100000000",
    attributes: '{"http.method":"GET","http.status_code":200}',
    status_code: 0,
    status_message: "",
    resource_attrs: '{"service.name":"sincpro-mobile"}',
    created_at: "2026-06-24 00:00:00",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// OTLP attribute encoding — Alloy/Tempo reject payloads with wrong value types.
// These are compliance tests against the OTLP/JSON spec.
// ---------------------------------------------------------------------------

test("serializeToOtlp: string attributes encoded as {stringValue}", () => {
  const result = serializeToOtlp([makeRow({ attributes: '{"http.method":"GET"}' })]);
  const attrs = result.resourceSpans[0].scopeSpans[0].spans[0].attributes;
  assert.deepEqual(attrs.find((a) => a.key === "http.method")?.value, { stringValue: "GET" });
});

test("serializeToOtlp: integer attributes encoded as {intValue: string} — not number", () => {
  // OTLP/JSON encodes int64 as string to avoid JS Number precision loss
  const result = serializeToOtlp([makeRow({ attributes: '{"http.status_code":200}' })]);
  const attrs = result.resourceSpans[0].scopeSpans[0].spans[0].attributes;
  const val = attrs.find((a) => a.key === "http.status_code")?.value;
  assert.deepEqual(val, { intValue: "200" });
  // must be string, not number — Alloy rejects {intValue: 200}
  assert.equal(typeof (val as { intValue: string }).intValue, "string");
});

test("serializeToOtlp: boolean attributes encoded as {boolValue}", () => {
  const result = serializeToOtlp([makeRow({ attributes: '{"error":true}' })]);
  const attrs = result.resourceSpans[0].scopeSpans[0].spans[0].attributes;
  assert.deepEqual(attrs.find((a) => a.key === "error")?.value, { boolValue: true });
});

test("serializeToOtlp: float attributes encoded as {doubleValue}", () => {
  const result = serializeToOtlp([makeRow({ attributes: '{"duration_ms":12.5}' })]);
  const attrs = result.resourceSpans[0].scopeSpans[0].spans[0].attributes;
  assert.deepEqual(attrs.find((a) => a.key === "duration_ms")?.value, { doubleValue: 12.5 });
});

// parentSpanId must be absent (not null/undefined string) when there is no parent —
// OTLP/JSON spec requires the field to be omitted entirely for root spans.
test("serializeToOtlp: parentSpanId omitted for root spans (not null or empty string)", () => {
  const result = serializeToOtlp([makeRow({ parent_span_id: null })]);
  const span = result.resourceSpans[0].scopeSpans[0].spans[0];
  assert.ok(!("parentSpanId" in span), "parentSpanId must not be present on root span");
});

test("serializeToOtlp: parentSpanId present when span has a parent", () => {
  const result = serializeToOtlp([makeRow({ parent_span_id: "parentaabb1122" })]);
  const span = result.resourceSpans[0].scopeSpans[0].spans[0];
  assert.equal(span.parentSpanId, "parentaabb1122");
});

// Resource grouping — spans with the same resource must share one ResourceSpans
// entry, otherwise the payload size grows linearly with span count.
test("serializeToOtlp: spans with same resource grouped into one resourceSpans entry", () => {
  const rows = [
    makeRow({ id: 1, span_id: "aa", resource_attrs: '{"service.name":"mobile"}' }),
    makeRow({ id: 2, span_id: "bb", resource_attrs: '{"service.name":"mobile"}' }),
  ];
  const result = serializeToOtlp(rows);
  assert.equal(result.resourceSpans.length, 1);
  assert.equal(result.resourceSpans[0].scopeSpans[0].spans.length, 2);
});

test("serializeToOtlp: spans with different resources produce separate resourceSpans", () => {
  const rows = [
    makeRow({ id: 1, span_id: "aa", resource_attrs: '{"service.name":"mobile"}' }),
    makeRow({ id: 2, span_id: "bb", resource_attrs: '{"service.name":"worker"}' }),
  ];
  assert.equal(serializeToOtlp(rows).resourceSpans.length, 2);
});

// Empty status_message must not appear in the payload — collectors treat
// an explicit empty message differently from an absent one.
test("serializeToOtlp: empty status_message omitted from payload", () => {
  const result = serializeToOtlp([makeRow({ status_message: "" })]);
  const span = result.resourceSpans[0].scopeSpans[0].spans[0];
  assert.ok(!span.status.message, "empty status_message must be absent");
});
