import assert from "node:assert/strict";
import test from "node:test";

import {
  _resetTelemetry,
  getLokiClient,
  initTelemetry,
  LokiClient,
} from "../../sincpro_mobile/infrastructure/telemetry/config.ts";
import { TelemetryQueueRepository } from "../../sincpro_mobile/infrastructure/telemetry/queue_repository.ts";

function makeCursor() {
  const store: { id: number; level: string; message: string; created_at: string }[] = [];
  let seq = 1;
  return {
    cursor: {
      async mutateDatabase(sql: string, ...params: unknown[]) {
        if (/INSERT/i.test(sql)) {
          store.push({
            id: seq++,
            level: params[0] as string,
            message: params[1] as string,
            created_at: "2026-06-24 00:00:00",
          });
          return { lastInsertRowId: seq - 1 };
        }
        return { lastInsertRowId: 0 };
      },
      async getAllAsync<T>(_sql: string, ...params: unknown[]): Promise<T[]> {
        return store.slice(0, (params[0] as number) ?? 100) as unknown as T[];
      },
    },
    store,
  };
}

function mockFetch(status = 204) {
  const calls: { url: string; body: unknown }[] = [];
  const original = global.fetch;
  global.fetch = async (input, init) => {
    calls.push({ url: input as string, body: JSON.parse(init?.body as string) });
    return new Response(null, { status });
  };
  return {
    calls,
    restore: () => {
      global.fetch = original;
    },
  };
}

// deliver groups entries by level into separate Loki streams — if wrong,
// Loki receives mixed streams and queries by level break in Grafana.
test("LokiClient.deliver: groups entries by level into separate streams", async () => {
  const mock = mockFetch();
  try {
    const client = new LokiClient({ endpoint: "http://loki.test", labels: { app: "app" } });
    await client.deliver([
      { id: 1, level: "info", message: "a", created_at: "2026-06-24 08:00:00" },
      { id: 2, level: "error", message: "b", created_at: "2026-06-24 08:01:00" },
      { id: 3, level: "info", message: "c", created_at: "2026-06-24 08:02:00" },
    ]);
    const { streams } = mock.calls[0].body as {
      streams: { stream: Record<string, string>; values: unknown[] }[];
    };
    assert.equal(streams.find((s) => s.stream.level === "info")?.values.length, 2);
    assert.equal(streams.find((s) => s.stream.level === "error")?.values.length, 1);
  } finally {
    mock.restore();
  }
});

// deliver must throw on non-2xx — if it swallows the error, flush_job calls
// removeMany anyway and entries are lost without reaching Loki.
test("LokiClient.deliver: throws on non-2xx so flush_job keeps entries in queue", async () => {
  const mock = mockFetch(429);
  try {
    const client = new LokiClient({ endpoint: "http://loki.test", labels: { app: "app" } });
    await assert.rejects(
      () =>
        client.deliver([
          { id: 1, level: "warn", message: "x", created_at: "2026-06-24 00:00:00" },
        ]),
      /429/,
    );
  } finally {
    mock.restore();
  }
});

// push fallback — offline errors must reach Loki eventually via the queue.
test("LokiClient.push: enqueues to SQLite when fetch fails (offline path)", async () => {
  const { cursor, store } = makeCursor();
  const repo = new TelemetryQueueRepository(cursor);
  const original = global.fetch;
  global.fetch = async () => {
    throw new Error("network down");
  };
  try {
    _resetTelemetry();
    initTelemetry({ loki: { endpoint: "http://loki.test", labels: { app: "app" } } }, repo);
    getLokiClient()!.push("error", "checkout timeout");
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(store.length, 1);
    assert.equal(store[0].level, "error");
  } finally {
    global.fetch = original;
    _resetTelemetry();
  }
});
