import assert from "node:assert/strict";
import test from "node:test";

import {
  hrTimeToNanoString,
  type SerializableSpan,
  serializeSpan,
} from "../../sincpro_mobile/infrastructure/telemetry/tracing/span_serializer.ts";

const NS_FLOOR = BigInt("1700000000000000000");
const NS_CEIL = BigInt("2000000000000000000");

function makeSpan(overrides: Partial<SerializableSpan> = {}): SerializableSpan {
  return {
    name: "op",
    kind: 1,
    spanContext: () => ({
      traceId: "aaaabbbbccccdddd0000111122223333",
      spanId: "aabbccdd11223344",
    }),
    parentSpanContext: undefined,
    startTime: [1750000000, 0],
    endTime: [1750000000, 100_000_000],
    attributes: {},
    status: { code: 0 },
    resource: { attributes: {} },
    ...overrides,
  };
}

// BigInt precision — float64 at 1.75e18 has granularity ~256, making the ns
// counter invisible and producing duplicate timestamps that Loki/Tempo reject.
test("hrTimeToNanoString: result is in nanosecond range for 2026", () => {
  const ns = BigInt(hrTimeToNanoString([1750000000, 0]));
  assert.ok(ns >= NS_FLOOR && ns <= NS_CEIL, `${ns} out of expected range`);
});

test("hrTimeToNanoString: nanosecond component is preserved with full precision", () => {
  const withoutNs = BigInt(hrTimeToNanoString([1750000000, 0]));
  const withNs = BigInt(hrTimeToNanoString([1750000000, 500_000_000]));
  // if float64 were used this subtraction would be 0 or wrong due to precision loss
  assert.equal(withNs - withoutNs, 500_000_000n);
});

test("hrTimeToNanoString: strictly increasing for sequential times", () => {
  const times: [number, number][] = [
    [1750000000, 0],
    [1750000000, 1],
    [1750000000, 1_000_000],
    [1750000001, 0],
  ];
  const nanos = times.map((t) => BigInt(hrTimeToNanoString(t)));
  for (let i = 1; i < nanos.length; i++) {
    assert.ok(nanos[i] > nanos[i - 1], `${nanos[i]} must be > ${nanos[i - 1]}`);
  }
});

// parentSpanId linkage — if null leaks as string "null", parent-child
// relationship breaks in Tempo and trace is shown as disconnected root span.
test("serializeSpan: parent_span_id is null when parentSpanContext is undefined", () => {
  const row = serializeSpan(makeSpan({ parentSpanContext: undefined }));
  assert.equal(row.parent_span_id, null);
});

test("serializeSpan: parent_span_id extracted from parentSpanContext when present", () => {
  const row = serializeSpan(makeSpan({ parentSpanContext: { spanId: "parentaabb1122" } }));
  assert.equal(row.parent_span_id, "parentaabb1122");
});

// resource absent — must not crash on spans from uninstrumented code paths
test("serializeSpan: resource_attrs defaults to empty object when resource is absent", () => {
  const row = serializeSpan(makeSpan({ resource: undefined }));
  assert.equal(row.resource_attrs, "{}");
});
