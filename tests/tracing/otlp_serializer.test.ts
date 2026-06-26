import assert from "node:assert/strict";
import test from "node:test";

import { OtlpClient } from "../../sincpro_mobile/infrastructure/telemetry/tracing/otlp_client.ts";
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
    events: "[]",
    links: "[]",
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

// ---------------------------------------------------------------------------
// OtlpClient — Content-Type guard (same invariant as LokiClient)
// ---------------------------------------------------------------------------

interface CapturedRequest {
  url: string;
  headers: Record<string, string>;
}

function captureFetch(): { requests: CapturedRequest[]; restore: () => void } {
  const requests: CapturedRequest[] = [];
  const original = global.fetch;
  global.fetch = async (input, init) => {
    requests.push({
      url: input as string,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    return new Response(null, { status: 200 });
  };
  return {
    requests,
    restore: () => {
      global.fetch = original;
    },
  };
}

test("OtlpClient: always sends Content-Type application/json", async () => {
  const { requests, restore } = captureFetch();
  try {
    const client = new OtlpClient({ endpoint: "http://collector" });
    await client.deliver([makeRow()]);
    assert.equal(requests[0].headers["Content-Type"], "application/json");
  } finally {
    restore();
  }
});

test("OtlpClient: custom headers are forwarded alongside Content-Type", async () => {
  const { requests, restore } = captureFetch();
  try {
    const client = new OtlpClient({
      endpoint: "http://collector",
      headers: { "api-key": "secret", "X-Scope-OrgID": "acme" },
    });
    await client.deliver([makeRow()]);
    assert.equal(requests[0].headers["api-key"], "secret");
    assert.equal(requests[0].headers["X-Scope-OrgID"], "acme");
    assert.equal(requests[0].headers["Content-Type"], "application/json");
  } finally {
    restore();
  }
});

test("OtlpClient: custom content-type cannot override application/json", async () => {
  const { requests, restore } = captureFetch();
  try {
    const client = new OtlpClient({
      endpoint: "http://collector",
      headers: { "content-type": "text/plain", "api-key": "k" },
    });
    await client.deliver([makeRow()]);
    assert.equal(requests[0].headers["Content-Type"], "application/json");
    assert.equal(requests[0].headers["api-key"], "k");
    assert.ok(!("content-type" in requests[0].headers), "lowercase key must be stripped");
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// Events — span.recordException() must reach Tempo as OTLP events with the
// correct attribute encoding.
// ---------------------------------------------------------------------------

test("serializeToOtlp: events included in span payload with encoded attributes", () => {
  const row = makeRow({
    events: JSON.stringify([
      {
        name: "exception",
        timeUnixNano: "1750000000500000000",
        attributes: { "exception.message": "boom", "exception.type": "Error" },
      },
    ]),
  });
  const span = serializeToOtlp([row]).resourceSpans[0].scopeSpans[0].spans[0];
  assert.equal(span.events.length, 1);
  assert.equal(span.events[0].name, "exception");
  assert.equal(span.events[0].timeUnixNano, "1750000000500000000");
  const msg = span.events[0].attributes.find((a) => a.key === "exception.message");
  assert.deepEqual(msg?.value, { stringValue: "boom" });
});

test("serializeToOtlp: empty events produces empty array in payload", () => {
  const span = serializeToOtlp([makeRow({ events: "[]" })]).resourceSpans[0].scopeSpans[0]
    .spans[0];
  assert.deepEqual(span.events, []);
});

// ---------------------------------------------------------------------------
// Links — cross-service correlation must survive SQLite → OTLP round-trip.
// ---------------------------------------------------------------------------

test("serializeToOtlp: links included in span payload with traceId and spanId", () => {
  const row = makeRow({
    links: JSON.stringify([
      {
        traceId: "bbbbccccddddeeee1111222233334444",
        spanId: "ccdd11223344aabb",
        attributes: { "link.type": "follows_from" },
      },
    ]),
  });
  const span = serializeToOtlp([row]).resourceSpans[0].scopeSpans[0].spans[0];
  assert.equal(span.links.length, 1);
  assert.equal(span.links[0].traceId, "bbbbccccddddeeee1111222233334444");
  assert.equal(span.links[0].spanId, "ccdd11223344aabb");
  const linkType = span.links[0].attributes.find((a) => a.key === "link.type");
  assert.deepEqual(linkType?.value, { stringValue: "follows_from" });
});

test("serializeToOtlp: empty links produces empty array in payload", () => {
  const span = serializeToOtlp([makeRow({ links: "[]" })]).resourceSpans[0].scopeSpans[0]
    .spans[0];
  assert.deepEqual(span.links, []);
});
