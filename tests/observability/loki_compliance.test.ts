/**
 * Loki Push API compliance — POST /loki/api/v1/push
 *
 * Spec reference: https://grafana.com/docs/loki/latest/reference/loki-http-api/#push-log-entries-to-loki
 * Tested against Loki 2.x / 3.x wire format (JSON path).
 *
 * Loki rejects:
 *   - Timestamps not in nanosecond range
 *   - Duplicate timestamps within the same stream
 *   - Entries out of order within a stream
 *   - Missing Content-Type header
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  _nowNs,
  LokiClient,
} from "../../sincpro_mobile/infrastructure/telemetry/logging/loki_client.ts";
import {
  _resetLokiClient as _resetTelemetry,
  getLokiClient,
  initLokiClient as initTelemetry,
} from "../../sincpro_mobile/infrastructure/telemetry/logging/loki_registry.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface LokiStream {
  stream: Record<string, string>;
  values: [string, string][];
}

interface LokiPayload {
  streams: LokiStream[];
}

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: LokiPayload;
}

function captureFetch(): { requests: CapturedRequest[]; restore: () => void } {
  const requests: CapturedRequest[] = [];
  const original = global.fetch;
  global.fetch = async (input, init) => {
    requests.push({
      url: input as string,
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: JSON.parse(init?.body as string),
    });
    return new Response(null, { status: 204 });
  };
  return {
    requests,
    restore: () => {
      global.fetch = original;
    },
  };
}

const NS_FLOOR = new Date("2020-01-01T00:00:00Z").getTime() * 1_000_000;
const NS_CEIL = new Date("2035-01-01T00:00:00Z").getTime() * 1_000_000;

function assertValidNsTimestamp(ts: string, label: string): void {
  assert.match(ts, /^\d+$/, `${label}: must be a numeric string, got "${ts}"`);
  const n = Number(ts);
  assert.ok(
    n > NS_FLOOR,
    `${label}: ${ts} is below nanosecond range (too small — looks like ms or seconds)`,
  );
  assert.ok(n < NS_CEIL, `${label}: ${ts} is above nanosecond range (too large)`);
}

// ---------------------------------------------------------------------------
// _nowNs — monotonic nanosecond clock
// ---------------------------------------------------------------------------

test("_nowNs: returns a numeric string", () => {
  const ts = _nowNs();
  assert.match(ts, /^\d+$/);
});

test("_nowNs: value is in nanosecond range (not ms, not seconds)", () => {
  assertValidNsTimestamp(_nowNs(), "_nowNs()");
});

test("_nowNs: consecutive calls are strictly increasing", () => {
  const samples = Array.from({ length: 200 }, () => _nowNs());
  for (let i = 1; i < samples.length; i++) {
    assert.ok(
      BigInt(samples[i]) > BigInt(samples[i - 1]),
      `_nowNs not monotonic at index ${i}: ${samples[i - 1]} >= ${samples[i]}`,
    );
  }
});

test("_nowNs: no duplicates across 1000 rapid calls", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const ts = _nowNs();
    assert.ok(!seen.has(ts), `duplicate timestamp: ${ts}`);
    seen.add(ts);
  }
});

// ---------------------------------------------------------------------------
// LokiClient.push — payload structure compliance
// ---------------------------------------------------------------------------

test("push: sends to correct Loki endpoint path", async () => {
  const { requests, restore } = captureFetch();
  try {
    const client = new LokiClient({
      endpoint: "https://loki.acme.com",
      labels: { app: "mobile" },
    });
    client.push("info", "msg");
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(requests[0].url, "https://loki.acme.com/loki/api/v1/push");
    assert.equal(requests[0].method, "POST");
  } finally {
    restore();
  }
});

test("push: sets Content-Type application/json", async () => {
  const { requests, restore } = captureFetch();
  try {
    const client = new LokiClient({ endpoint: "http://loki.test", labels: { app: "app" } });
    client.push("info", "msg");
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(requests[0].headers["Content-Type"], "application/json");
  } finally {
    restore();
  }
});

test("push: payload has top-level 'streams' array", async () => {
  const { requests, restore } = captureFetch();
  try {
    const client = new LokiClient({ endpoint: "http://loki.test", labels: { app: "app" } });
    client.push("info", "msg");
    await new Promise((r) => setTimeout(r, 10));

    const body = requests[0].body;
    assert.ok(Array.isArray(body.streams), "streams must be an array");
    assert.ok(body.streams.length > 0, "streams must not be empty");
  } finally {
    restore();
  }
});

test("push: each stream has 'stream' labels object and 'values' array", async () => {
  const { requests, restore } = captureFetch();
  try {
    const client = new LokiClient({
      endpoint: "http://loki.test",
      labels: { app: "sincpro-mobile", env: "prod" },
    });
    client.push("warn", "low disk");
    await new Promise((r) => setTimeout(r, 10));

    const stream = requests[0].body.streams[0];
    assert.ok(
      stream.stream && typeof stream.stream === "object",
      "stream.stream must be an object",
    );
    assert.ok(Array.isArray(stream.values), "stream.values must be an array");
    assert.ok(stream.values.length > 0, "stream.values must not be empty");
  } finally {
    restore();
  }
});

test("push: stream labels include all configured labels plus 'level'", async () => {
  const { requests, restore } = captureFetch();
  try {
    const client = new LokiClient({
      endpoint: "http://loki.test",
      labels: { app: "sincpro-mobile", env: "staging", tenant: "acme" },
    });
    client.push("error", "checkout failed");
    await new Promise((r) => setTimeout(r, 10));

    const labels = requests[0].body.streams[0].stream;
    assert.equal(labels.app, "sincpro-mobile");
    assert.equal(labels.env, "staging");
    assert.equal(labels.tenant, "acme");
    assert.equal(labels.level, "error");
  } finally {
    restore();
  }
});

test("push: each value entry is [timestamp_ns_string, log_line_string]", async () => {
  const { requests, restore } = captureFetch();
  try {
    const client = new LokiClient({ endpoint: "http://loki.test", labels: { app: "app" } });
    client.push("debug", "user login");
    await new Promise((r) => setTimeout(r, 10));

    const [ts, line] = requests[0].body.streams[0].values[0];
    assertValidNsTimestamp(ts, "push value[0]");
    assert.equal(typeof line, "string");
    assert.equal(line, "user login");
  } finally {
    restore();
  }
});

test("push: consecutive calls produce strictly increasing timestamps", async () => {
  const { requests, restore } = captureFetch();
  try {
    const client = new LokiClient({ endpoint: "http://loki.test", labels: { app: "app" } });

    // Fire 20 pushes synchronously — all in the same event loop tick (same ms)
    for (let i = 0; i < 20; i++) {
      client.push("info", `event-${i}`);
    }
    await new Promise((r) => setTimeout(r, 30));

    assert.equal(requests.length, 20);
    const timestamps = requests.map((r) => r.body.streams[0].values[0][0]);

    for (let i = 1; i < timestamps.length; i++) {
      assert.ok(
        BigInt(timestamps[i]) > BigInt(timestamps[i - 1]),
        `timestamp not strictly increasing at index ${i}: ${timestamps[i - 1]} >= ${timestamps[i]}`,
      );
    }
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// Auth & custom headers
// ---------------------------------------------------------------------------

test("headers: custom headers (e.g. api-key) are sent on every request", async () => {
  const { requests, restore } = captureFetch();
  try {
    const client = new LokiClient({
      endpoint: "http://loki.test",
      labels: { app: "app" },
      headers: { "sincpro-api-key": "secret-123", "X-Scope-OrgID": "acme" },
    });
    client.push("info", "msg");
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(requests[0].headers["sincpro-api-key"], "secret-123");
    assert.equal(requests[0].headers["X-Scope-OrgID"], "acme");
    assert.equal(requests[0].headers["Content-Type"], "application/json");
  } finally {
    restore();
  }
});

test("headers: basic auth and custom headers coexist", async () => {
  const { requests, restore } = captureFetch();
  try {
    const client = new LokiClient({
      endpoint: "http://loki.test",
      labels: { app: "app" },
      auth: { type: "basic", username: "u", password: "p" },
      headers: { "api-key": "k" },
    });
    client.push("info", "msg");
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(requests[0].headers["Authorization"], `Basic ${btoa("u:p")}`);
    assert.equal(requests[0].headers["api-key"], "k");
  } finally {
    restore();
  }
});

test("headers: explicit Authorization in headers overrides auth shortcut", async () => {
  const { requests, restore } = captureFetch();
  try {
    const client = new LokiClient({
      endpoint: "http://loki.test",
      labels: { app: "app" },
      auth: { type: "bearer", token: "from-auth" },
      headers: { Authorization: "Bearer from-headers" },
    });
    client.push("info", "msg");
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(requests[0].headers["Authorization"], "Bearer from-headers");
  } finally {
    restore();
  }
});

test("headers: a custom content-type cannot override the JSON Content-Type", async () => {
  const { requests, restore } = captureFetch();
  try {
    const client = new LokiClient({
      endpoint: "http://loki.test",
      labels: { app: "app" },
      // lowercase, would clobber the body's JSON content type if not guarded
      headers: { "content-type": "text/plain", "api-key": "k" },
    });
    client.push("info", "msg");
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(requests[0].headers["Content-Type"], "application/json");
    assert.equal(
      requests[0].headers["api-key"],
      "k",
      "other custom headers still pass through",
    );
    assert.equal(
      requests[0].headers["content-type"],
      undefined,
      "the clobbering lowercase header was stripped",
    );
  } finally {
    restore();
  }
});

test("headers: custom headers are also sent on the batch deliver path", async () => {
  const { requests, restore } = captureFetch();
  try {
    const client = new LokiClient({
      endpoint: "http://loki.test",
      labels: { app: "app" },
      headers: { "api-key": "batch-key" },
    });
    await client.deliver([
      { id: 1, level: "info", message: "x", created_at: "2026-06-24 00:00:00" },
    ]);

    assert.equal(requests[0].headers["api-key"], "batch-key");
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// LokiClient.deliver — batch payload compliance
// ---------------------------------------------------------------------------

const OUTBOX_ENTRIES = [
  { id: 1, level: "info", message: "route ACM-01 synced", created_at: "2026-06-24 08:00:00" },
  { id: 2, level: "info", message: "route ACM-02 synced", created_at: "2026-06-24 08:00:00" },
  {
    id: 3,
    level: "error",
    message: "Odoo 503 on checkout",
    created_at: "2026-06-24 08:00:01",
  },
  {
    id: 4,
    level: "warn",
    message: "retry #2 for order 77",
    created_at: "2026-06-24 08:00:01",
  },
];

test("deliver: sends to correct Loki endpoint path with POST", async () => {
  const { requests, restore } = captureFetch();
  try {
    const client = new LokiClient({
      endpoint: "https://loki.acme.com",
      labels: { app: "mobile" },
    });
    await client.deliver([OUTBOX_ENTRIES[0]]);

    assert.equal(requests[0].url, "https://loki.acme.com/loki/api/v1/push");
    assert.equal(requests[0].method, "POST");
    assert.equal(requests[0].headers["Content-Type"], "application/json");
  } finally {
    restore();
  }
});

test("deliver: groups entries by level — one Loki stream per level", async () => {
  const { requests, restore } = captureFetch();
  try {
    const client = new LokiClient({ endpoint: "http://loki.test", labels: { app: "app" } });
    await client.deliver(OUTBOX_ENTRIES);

    const { streams } = requests[0].body;
    const levels = streams.map((s) => s.stream.level).sort();
    assert.deepEqual(levels, ["error", "info", "warn"]);
  } finally {
    restore();
  }
});

test("deliver: timestamps within each stream are strictly increasing (no Loki 400)", async () => {
  const { requests, restore } = captureFetch();
  try {
    // Two info entries with the SAME created_at second — this is the duplicate bug scenario
    const sameSecondEntries = [
      { id: 10, level: "info", message: "msg-a", created_at: "2026-06-24 10:00:00" },
      { id: 11, level: "info", message: "msg-b", created_at: "2026-06-24 10:00:00" },
      { id: 12, level: "info", message: "msg-c", created_at: "2026-06-24 10:00:00" },
    ];

    const client = new LokiClient({ endpoint: "http://loki.test", labels: { app: "app" } });
    await client.deliver(sameSecondEntries);

    const infoStream = requests[0].body.streams.find((s) => s.stream.level === "info")!;
    const timestamps = infoStream.values.map(([ts]) => BigInt(ts));

    for (let i = 1; i < timestamps.length; i++) {
      assert.ok(
        timestamps[i] > timestamps[i - 1],
        `deliver timestamp not strictly increasing at index ${i}: ${timestamps[i - 1]} >= ${timestamps[i]}`,
      );
    }
  } finally {
    restore();
  }
});

test("deliver: all nanosecond timestamps in batch are in valid range", async () => {
  const { requests, restore } = captureFetch();
  try {
    const client = new LokiClient({ endpoint: "http://loki.test", labels: { app: "app" } });
    await client.deliver(OUTBOX_ENTRIES);

    for (const stream of requests[0].body.streams) {
      for (const [ts] of stream.values) {
        assertValidNsTimestamp(ts, `stream[${stream.stream.level}] value`);
      }
    }
  } finally {
    restore();
  }
});

test("deliver: configured labels appear in every stream", async () => {
  const { requests, restore } = captureFetch();
  try {
    const client = new LokiClient({
      endpoint: "http://loki.test",
      labels: { app: "sincpro-mobile", env: "prod", tenant: "acme" },
    });
    await client.deliver(OUTBOX_ENTRIES);

    for (const stream of requests[0].body.streams) {
      assert.equal(stream.stream.app, "sincpro-mobile", "app label missing");
      assert.equal(stream.stream.env, "prod", "env label missing");
      assert.equal(stream.stream.tenant, "acme", "tenant label missing");
    }
  } finally {
    restore();
  }
});

test("deliver: each value entry is [string, string] — timestamp and log line", async () => {
  const { requests, restore } = captureFetch();
  try {
    const client = new LokiClient({ endpoint: "http://loki.test", labels: { app: "app" } });
    await client.deliver([OUTBOX_ENTRIES[2]]); // one error entry

    const [ts, line] = requests[0].body.streams[0].values[0];
    assert.equal(typeof ts, "string");
    assert.equal(typeof line, "string");
    assert.equal(line, "Odoo 503 on checkout");
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// Initialization — initTelemetry ordering invariant
// ---------------------------------------------------------------------------

test("initTelemetry: client is null before init, non-null after", () => {
  _resetTelemetry();
  assert.equal(getLokiClient(), null, "client must be null before initTelemetry");

  initTelemetry({ endpoint: "http://loki.test", labels: { app: "test" } });
  assert.ok(getLokiClient() !== null, "client must be set after initTelemetry");

  _resetTelemetry();
});

test("initTelemetry: re-calling replaces the client (idempotent restart)", () => {
  _resetTelemetry();
  initTelemetry({ endpoint: "http://a.test", labels: { app: "a" } });
  const first = getLokiClient();

  initTelemetry({ endpoint: "http://b.test", labels: { app: "b" } });
  const second = getLokiClient();

  assert.notEqual(first, second, "second initTelemetry must replace the client");
  _resetTelemetry();
});
