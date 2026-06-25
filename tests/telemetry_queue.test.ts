import assert from "node:assert/strict";
import test from "node:test";

import {
  _resetTelemetry,
  getLokiClient,
  initTelemetry,
  LokiClient,
} from "../sincpro_mobile/infrastructure/telemetry/config.ts";
import { TelemetryQueueRepository } from "../sincpro_mobile/infrastructure/telemetry/queue_repository.ts";

// ---------------------------------------------------------------------------
// In-memory cursor — simulates DBCursor for TelemetryQueueRepository tests
// ---------------------------------------------------------------------------

interface Row {
  id: number;
  level: string;
  message: string;
  created_at: string;
}

function makeCursor() {
  const store: Row[] = [];
  let seq = 1;

  const cursor = {
    async mutateDatabase(
      sql: string,
      ...params: unknown[]
    ): Promise<{ lastInsertRowId: number }> {
      if (/INSERT INTO telemetry_queue/i.test(sql)) {
        const id = seq++;
        store.push({
          id,
          level: params[0] as string,
          message: params[1] as string,
          created_at: "2026-06-24 10:00:00",
        });
        return { lastInsertRowId: id };
      }

      if (/DELETE .* WHERE id IN/i.test(sql)) {
        const idsToRemove = new Set(params as number[]);
        for (let i = store.length - 1; i >= 0; i--) {
          if (idsToRemove.has(store[i].id)) store.splice(i, 1);
        }
        return { lastInsertRowId: 0 };
      }

      if (/DELETE .* WHERE created_at/i.test(sql)) {
        // pruneExpired — verified separately; just no-op here
        return { lastInsertRowId: 0 };
      }

      return { lastInsertRowId: 0 };
    },

    async getAllAsync<T>(_sql: string, ...params: unknown[]): Promise<T[]> {
      const limit = (params[0] as number) ?? 100;
      return store.slice(0, limit) as unknown as T[];
    },
  };

  return { cursor, store };
}

// ---------------------------------------------------------------------------
// TelemetryQueueRepository — enqueue / findPending / removeMany
// ---------------------------------------------------------------------------

test("TelemetryQueueRepository.enqueue: stored entries are returned by findPending", async () => {
  const { cursor } = makeCursor();
  const repo = new TelemetryQueueRepository(cursor);

  await repo.enqueue("info", "order ACM-001 synced to Odoo");
  await repo.enqueue("error", "route fetch failed: 503");

  const entries = await repo.findPending();

  assert.equal(entries.length, 2);
  assert.equal(entries[0].level, "info");
  assert.equal(entries[0].message, "order ACM-001 synced to Odoo");
  assert.equal(entries[1].level, "error");
  assert.equal(entries[1].message, "route fetch failed: 503");
});

test("TelemetryQueueRepository.findPending: respects limit", async () => {
  const { cursor } = makeCursor();
  const repo = new TelemetryQueueRepository(cursor);

  await repo.enqueue("debug", "msg-1");
  await repo.enqueue("debug", "msg-2");
  await repo.enqueue("debug", "msg-3");

  const entries = await repo.findPending(2);
  assert.equal(entries.length, 2);
});

test("TelemetryQueueRepository.removeMany: removes specified entries, leaves the rest", async () => {
  const { cursor } = makeCursor();
  const repo = new TelemetryQueueRepository(cursor);

  await repo.enqueue("info", "keep-me");
  await repo.enqueue("warn", "remove-me-1");
  await repo.enqueue("error", "remove-me-2");

  const all = await repo.findPending();
  assert.equal(all.length, 3);

  const toRemove = all.filter((e) => e.message !== "keep-me").map((e) => e.id);
  await repo.removeMany(toRemove);

  const remaining = await repo.findPending();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].message, "keep-me");
});

test("TelemetryQueueRepository.removeMany: empty array is a no-op", async () => {
  const { cursor, store } = makeCursor();
  const repo = new TelemetryQueueRepository(cursor);

  await repo.enqueue("info", "stays");
  await repo.removeMany([]);

  assert.equal(store.length, 1);
});

// ---------------------------------------------------------------------------
// LokiClient.deliver — batch sending
// ---------------------------------------------------------------------------

interface FetchCall {
  url: string;
  body: { streams: { stream: Record<string, string>; values: [string, string][] }[] };
}

function mockFetch(): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = [];
  const original = global.fetch;
  global.fetch = async (input, init) => {
    calls.push({
      url: input as string,
      body: JSON.parse(init?.body as string),
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

test("LokiClient.deliver: groups entries by level into separate Loki streams", async () => {
  const mock = mockFetch();
  try {
    const client = new LokiClient({
      endpoint: "http://loki.test",
      labels: { app: "sincpro-mobile", env: "staging" },
    });

    await client.deliver([
      { id: 1, level: "info", message: "route loaded", created_at: "2026-06-24 08:00:00" },
      { id: 2, level: "error", message: "sync failed", created_at: "2026-06-24 08:01:00" },
      { id: 3, level: "info", message: "order synced", created_at: "2026-06-24 08:02:00" },
    ]);

    assert.equal(mock.calls.length, 1);
    const { streams } = mock.calls[0].body;

    const infoStream = streams.find((s) => s.stream.level === "info");
    const errorStream = streams.find((s) => s.stream.level === "error");

    assert.ok(infoStream, "info stream present");
    assert.equal(infoStream!.values.length, 2, "two info entries batched");
    assert.ok(errorStream, "error stream present");
    assert.equal(errorStream!.values.length, 1, "one error entry");
  } finally {
    mock.restore();
  }
});

test("LokiClient.deliver: no-op for empty entries", async () => {
  const mock = mockFetch();
  try {
    const client = new LokiClient({ endpoint: "http://loki.test", labels: { app: "app" } });
    await client.deliver([]);
    assert.equal(mock.calls.length, 0);
  } finally {
    mock.restore();
  }
});

test("LokiClient.deliver: throws on non-2xx response so caller keeps queue entries", async () => {
  const original = global.fetch;
  global.fetch = async () => new Response(null, { status: 429 });
  try {
    const client = new LokiClient({ endpoint: "http://loki.test", labels: { app: "app" } });
    await assert.rejects(
      () =>
        client.deliver([
          { id: 1, level: "warn", message: "x", created_at: "2026-06-24 00:00:00" },
        ]),
      /HTTP 429/,
    );
  } finally {
    global.fetch = original;
  }
});

// ---------------------------------------------------------------------------
// push fallback — enqueues to queue on network failure
// ---------------------------------------------------------------------------

test("LokiClient.push: writes to queue when fetch fails (offline fallback)", async () => {
  const { cursor } = makeCursor();
  const repo = new TelemetryQueueRepository(cursor);

  const original = global.fetch;
  global.fetch = async () => {
    throw new Error("network down");
  };
  try {
    _resetTelemetry();
    initTelemetry({ loki: { endpoint: "http://loki.test", labels: { app: "app" } } }, repo);
    const client = getLokiClient()!;

    client.push("error", "checkout timeout on route ACM-042");

    // wait for microtask + async enqueue
    await new Promise((r) => setTimeout(r, 20));

    const queued = await repo.findPending();
    assert.equal(queued.length, 1);
    assert.equal(queued[0].level, "error");
    assert.equal(queued[0].message, "checkout timeout on route ACM-042");
  } finally {
    global.fetch = original;
    _resetTelemetry();
  }
});

test("LokiClient.push: does not enqueue when no queue is configured (queue is null)", async () => {
  const original = global.fetch;
  global.fetch = async () => {
    throw new Error("network down");
  };
  try {
    // LokiClient without queue — failure silently dropped
    const client = new LokiClient({ endpoint: "http://loki.test", labels: { app: "app" } });
    assert.doesNotThrow(() => client.push("warn", "msg"));
    await new Promise((r) => setTimeout(r, 20));
    // no assertion on queue — there is none; test just verifies no throw
  } finally {
    global.fetch = original;
  }
});
