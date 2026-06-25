import assert from "node:assert/strict";
import test from "node:test";

import { LokiClient } from "../../sincpro_mobile/infrastructure/telemetry/logging/loki_client.ts";
import {
  _resetLokiClient as _resetTelemetry,
  getLokiClient,
  initLokiClient as initTelemetry,
} from "../../sincpro_mobile/infrastructure/telemetry/logging/loki_registry.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function mockFetch(): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = [];
  const original = global.fetch;
  global.fetch = async (input, init) => {
    calls.push({
      url: input as string,
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: JSON.parse((init?.body as string) ?? "null"),
    });
    return new Response(null, { status: 204 });
  };
  return {
    calls,
    restore: () => {
      global.fetch = original;
    },
  };
}

function failingFetch(): { restore: () => void } {
  const original = global.fetch;
  global.fetch = async () => {
    throw new Error("network error");
  };
  return {
    restore: () => {
      global.fetch = original;
    },
  };
}

// ---------------------------------------------------------------------------
// config — initTelemetry / getLokiClient
// ---------------------------------------------------------------------------

test("getLokiClient: returns null before initTelemetry is called", () => {
  _resetTelemetry();
  assert.equal(getLokiClient(), null);
});

test("initTelemetry: getLokiClient returns a LokiClient after init", () => {
  _resetTelemetry();
  initTelemetry({
    endpoint: "http://loki.test",
    labels: { app: "test-app", env: "test" },
  });
  assert.ok(getLokiClient() instanceof LokiClient);
  _resetTelemetry();
});

test("initTelemetry: second call replaces the client (last config wins)", () => {
  _resetTelemetry();
  initTelemetry({ endpoint: "http://loki-a.test", labels: { app: "a" } });
  const first = getLokiClient();
  initTelemetry({ endpoint: "http://loki-b.test", labels: { app: "b" } });
  const second = getLokiClient();
  assert.notEqual(first, second);
  _resetTelemetry();
});

// ---------------------------------------------------------------------------
// LokiClient — push
// ---------------------------------------------------------------------------

test("LokiClient.push: sends correct payload to Loki endpoint", async () => {
  const mock = mockFetch();
  try {
    const client = new LokiClient({
      endpoint: "http://loki.test",
      labels: { app: "sincpro-mobile", env: "staging", tenant: "acme" },
    });

    client.push("info", "order synced successfully");

    // push is fire-and-forget — wait one microtask tick for the fetch to enqueue
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(mock.calls.length, 1);

    const call = mock.calls[0];
    assert.equal(call.url, "http://loki.test/loki/api/v1/push");
    assert.equal(call.method, "POST");

    const body = call.body as {
      streams: { stream: Record<string, string>; values: [string, string][] }[];
    };
    const stream = body.streams[0];

    assert.equal(stream.stream.app, "sincpro-mobile");
    assert.equal(stream.stream.env, "staging");
    assert.equal(stream.stream.tenant, "acme");
    assert.equal(stream.stream.level, "info");
    assert.equal(stream.values[0][1], "order synced successfully");
    assert.match(
      stream.values[0][0],
      /^\d+$/,
      "timestamp must be numeric nanoseconds string",
    );
  } finally {
    mock.restore();
  }
});

test("LokiClient.push: level label is included in stream labels", async () => {
  const mock = mockFetch();
  try {
    const client = new LokiClient({ endpoint: "http://loki.test", labels: { app: "app" } });
    client.push("error", "something failed");
    await new Promise((r) => setTimeout(r, 10));

    const body = mock.calls[0].body as { streams: { stream: Record<string, string> }[] };
    assert.equal(body.streams[0].stream.level, "error");
  } finally {
    mock.restore();
  }
});

test("LokiClient.push: basic auth sends correct Authorization header", async () => {
  const mock = mockFetch();
  try {
    const client = new LokiClient({
      endpoint: "http://loki.test",
      labels: { app: "app" },
      auth: { type: "basic", username: "tenant-123", password: "supersecret" },
    });
    client.push("info", "msg");
    await new Promise((r) => setTimeout(r, 10));

    const authHeader = mock.calls[0].headers["Authorization"];
    const expected = `Basic ${btoa("tenant-123:supersecret")}`;
    assert.equal(authHeader, expected);
  } finally {
    mock.restore();
  }
});

test("LokiClient.push: bearer auth sends correct Authorization header", async () => {
  const mock = mockFetch();
  try {
    const client = new LokiClient({
      endpoint: "http://loki.test",
      labels: { app: "app" },
      auth: { type: "bearer", token: "my-api-token" },
    });
    client.push("info", "msg");
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(mock.calls[0].headers["Authorization"], "Bearer my-api-token");
  } finally {
    mock.restore();
  }
});

test("LokiClient.push: no auth header when auth is omitted", async () => {
  const mock = mockFetch();
  try {
    const client = new LokiClient({ endpoint: "http://loki.test", labels: { app: "app" } });
    client.push("info", "msg");
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(mock.calls[0].headers["Authorization"], undefined);
  } finally {
    mock.restore();
  }
});

test("LokiClient.push: network failure does not throw", async () => {
  const { restore } = failingFetch();
  try {
    const client = new LokiClient({ endpoint: "http://loki.test", labels: { app: "app" } });
    // Must not throw synchronously or reject
    assert.doesNotThrow(() => client.push("warn", "offline message"));
    await new Promise((r) => setTimeout(r, 10));
    // still no throw after the async failure resolves
  } finally {
    restore();
  }
});
