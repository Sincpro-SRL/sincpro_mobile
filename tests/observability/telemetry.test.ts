import assert from "node:assert/strict";
import test from "node:test";

import type {
  LogEntry,
  LogQueueRepository,
} from "../../sincpro_mobile/infrastructure/telemetry/logging/log_queue_repository.ts";
import { LokiClient } from "../../sincpro_mobile/infrastructure/telemetry/logging/loki_client.ts";
import {
  _resetLogShipping,
  initLogShipping,
  shipLog,
  shipsLogs,
} from "../../sincpro_mobile/infrastructure/telemetry/logging/loki_registry.ts";

let seq = 0;

/** One line as the log queue keeps it, written now. */
function entry(level: string, message: string): LogEntry {
  return {
    id: ++seq,
    level,
    message,
    created_at: new Date().toISOString().replace("T", " ").replace("Z", ""),
  };
}

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

// ---------------------------------------------------------------------------
// Shipping — a line is stored, then the flush is told; never sent alone
// ---------------------------------------------------------------------------

test("shipLog: nothing is shipped before telemetry starts", () => {
  _resetLogShipping();
  assert.equal(shipsLogs(), false);
  assert.doesNotThrow(() => shipLog("info", "before start"));
});

test("shipLog: a line is stored first, then the flush is told — no request of its own", async () => {
  const stored: [string, string][] = [];
  let told = 0;
  const mock = mockFetch();
  try {
    initLogShipping(
      {
        enqueue: async (level: string, line: string) => void stored.push([level, line]),
      } as unknown as LogQueueRepository,
      () => {
        told += 1;
      },
    );
    assert.equal(shipsLogs(), true);
    shipLog("info", "order synced");
    shipLog("debug", "user login");
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(stored, [
      ["info", "order synced"],
      ["debug", "user login"],
    ]);
    assert.equal(told, 2, "the debounced signal collapses them into one batch");
    assert.equal(mock.calls.length, 0, "no line goes out by itself");
  } finally {
    mock.restore();
    _resetLogShipping();
  }
});

test("shipLog: a queue that fails never throws into the use case", async () => {
  initLogShipping(
    {
      enqueue: async () => Promise.reject(new Error("disk full")),
    } as unknown as LogQueueRepository,
    () => undefined,
  );
  try {
    assert.doesNotThrow(() => shipLog("warn", "offline message"));
    await new Promise((r) => setTimeout(r, 10));
  } finally {
    _resetLogShipping();
  }
});

// ---------------------------------------------------------------------------
// LokiClient — deliver
// ---------------------------------------------------------------------------

test("LokiClient.deliver: sends correct payload to Loki endpoint", async () => {
  const mock = mockFetch();
  try {
    const client = new LokiClient({
      endpoint: "http://loki.test",
      labels: { app: "sincpro-mobile", env: "staging", tenant: "acme" },
    });

    await client.deliver([entry("info", "order synced successfully")]);

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

test("LokiClient.deliver: level label is included in stream labels", async () => {
  const mock = mockFetch();
  try {
    const client = new LokiClient({ endpoint: "http://loki.test", labels: { app: "app" } });
    await client.deliver([entry("error", "something failed")]);

    const body = mock.calls[0].body as { streams: { stream: Record<string, string> }[] };
    assert.equal(body.streams[0].stream.level, "error");
  } finally {
    mock.restore();
  }
});

test("LokiClient.deliver: basic auth sends correct Authorization header", async () => {
  const mock = mockFetch();
  try {
    const client = new LokiClient({
      endpoint: "http://loki.test",
      labels: { app: "app" },
      auth: { type: "basic", username: "tenant-123", password: "supersecret" },
    });
    await client.deliver([entry("info", "msg")]);

    const authHeader = mock.calls[0].headers["Authorization"];
    const expected = `Basic ${btoa("tenant-123:supersecret")}`;
    assert.equal(authHeader, expected);
  } finally {
    mock.restore();
  }
});

test("LokiClient.deliver: bearer auth sends correct Authorization header", async () => {
  const mock = mockFetch();
  try {
    const client = new LokiClient({
      endpoint: "http://loki.test",
      labels: { app: "app" },
      auth: { type: "bearer", token: "my-api-token" },
    });
    await client.deliver([entry("info", "msg")]);

    assert.equal(mock.calls[0].headers["Authorization"], "Bearer my-api-token");
  } finally {
    mock.restore();
  }
});

test("LokiClient.deliver: no auth header when auth is omitted", async () => {
  const mock = mockFetch();
  try {
    const client = new LokiClient({ endpoint: "http://loki.test", labels: { app: "app" } });
    await client.deliver([entry("info", "msg")]);

    assert.equal(mock.calls[0].headers["Authorization"], undefined);
  } finally {
    mock.restore();
  }
});
