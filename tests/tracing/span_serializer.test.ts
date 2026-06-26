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
    events: [],
    links: [],
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

// service.name flows through to resource_attrs so Grafana/Tempo can group by service
test("serializeSpan: service.name in resource.attributes is preserved in resource_attrs", () => {
  const row = serializeSpan(
    makeSpan({ resource: { attributes: { "service.name": "pos-mobile" } } }),
  );
  const attrs = JSON.parse(row.resource_attrs) as Record<string, unknown>;
  assert.equal(attrs["service.name"], "pos-mobile");
});

// ---------------------------------------------------------------------------
// Events — span.recordException() produces an event; it must survive the
// SQLite round-trip so Tempo can display the full stacktrace.
// ---------------------------------------------------------------------------

test("serializeSpan: events defaults to empty JSON array when absent", () => {
  const row = serializeSpan(makeSpan({ events: undefined }));
  assert.deepEqual(JSON.parse(row.events), []);
});

test("serializeSpan: events serialized with name, timeUnixNano and attributes", () => {
  const row = serializeSpan(
    makeSpan({
      events: [
        {
          name: "exception",
          time: [1750000000, 500_000_000],
          attributes: { "exception.message": "boom", "exception.type": "Error" },
        },
      ],
    }),
  );
  const events = JSON.parse(row.events) as {
    name: string;
    timeUnixNano: string;
    attributes: Record<string, unknown>;
  }[];
  assert.equal(events.length, 1);
  assert.equal(events[0].name, "exception");
  // timeUnixNano must be the BigInt-precise nanosecond string
  assert.equal(events[0].timeUnixNano, hrTimeToNanoString([1750000000, 500_000_000]));
  assert.equal(events[0].attributes["exception.message"], "boom");
});

// ---------------------------------------------------------------------------
// Links — cross-service span linkage; traceId/spanId must survive round-trip.
// ---------------------------------------------------------------------------

test("serializeSpan: links defaults to empty JSON array when absent", () => {
  const row = serializeSpan(makeSpan({ links: undefined }));
  assert.deepEqual(JSON.parse(row.links), []);
});

test("serializeSpan: links serialized with traceId, spanId and attributes", () => {
  const row = serializeSpan(
    makeSpan({
      links: [
        {
          context: {
            traceId: "bbbbccccddddeeee1111222233334444",
            spanId: "ccdd11223344aabb",
          },
          attributes: { "link.type": "follows_from" },
        },
      ],
    }),
  );
  const links = JSON.parse(row.links) as {
    traceId: string;
    spanId: string;
    attributes: Record<string, unknown>;
  }[];
  assert.equal(links.length, 1);
  assert.equal(links[0].traceId, "bbbbccccddddeeee1111222233334444");
  assert.equal(links[0].spanId, "ccdd11223344aabb");
  assert.equal(links[0].attributes["link.type"], "follows_from");
});
