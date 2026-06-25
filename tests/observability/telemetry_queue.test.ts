import assert from "node:assert/strict";
import test from "node:test";

import { LogQueueRepository } from "../../sincpro_mobile/infrastructure/telemetry/logging/log_queue_repository.ts";
import { LokiClient } from "../../sincpro_mobile/infrastructure/telemetry/logging/loki_client.ts";
import {
  _resetLokiClient as _resetTelemetry,
  getLokiClient,
  initLokiClient as initTelemetry,
} from "../../sincpro_mobile/infrastructure/telemetry/logging/loki_registry.ts";

function makeCursor() {
  const store: { id: number; level: string; message: string; created_at: string }[] = [];
  let seq = 1;
  return {
    cursor: {
      async mutateDatabase(sql: string, ...params: unknown[]) {
        const q = sql.trim().toUpperCase();

        // Severity-aware eviction: DELETE ... ORDER BY <severity CASE> ASC, id ASC LIMIT ?
        if (q.startsWith("DELETE") && q.includes("LIMIT")) {
          const toDrop = Math.max(0, params[0] as number);
          const rank: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
          const prio = (lvl: string) => rank[lvl.toLowerCase()] ?? 1;
          // Pick victims lowest-severity-first, oldest-first within a tier.
          const victims = [...store]
            .sort((a, b) => prio(a.level) - prio(b.level) || a.id - b.id)
            .slice(0, toDrop)
            .map((r) => r.id);
          const victimIds = new Set(victims);
          let removed = 0;
          for (let i = store.length - 1; i >= 0; i--) {
            if (victimIds.has(store[i].id)) {
              store.splice(i, 1);
              removed++;
            }
          }
          return { changes: removed, lastInsertRowId: 0 };
        }

        // removeMany: DELETE ... id IN (?, ?, ...)
        if (q.startsWith("DELETE") && q.includes("IN (")) {
          const ids = new Set(params as number[]);
          let removed = 0;
          for (let i = store.length - 1; i >= 0; i--) {
            if (ids.has(store[i].id)) {
              store.splice(i, 1);
              removed++;
            }
          }
          return { changes: removed, lastInsertRowId: 0 };
        }

        if (q.startsWith("INSERT")) {
          store.push({
            id: seq++,
            level: params[0] as string,
            message: params[1] as string,
            created_at: "2026-06-24 00:00:00",
          });
          return { changes: 1, lastInsertRowId: seq - 1 };
        }
        return { changes: 0, lastInsertRowId: 0 };
      },
      async getFirstAsync<T>(_sql: string, ..._params: unknown[]): Promise<T> {
        const bytes = store.reduce((acc, r) => acc + r.level.length + r.message.length, 0);
        return { rows: store.length, bytes } as unknown as T;
      },
      async getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
        const q = sql.toUpperCase();
        // Byte-eviction candidates: SELECT id, (length(level)+length(message)) AS len
        // ORDER BY <len> DESC, id ASC LIMIT 500  → largest-first
        if (q.includes(" AS LEN")) {
          return [...store]
            .map((r) => ({ id: r.id, len: r.level.length + r.message.length }))
            .sort((a, b) => b.len - a.len || a.id - b.id)
            .slice(0, 500) as unknown as T[];
        }
        // findPending: oldest-first full rows
        return store.slice(0, (params[0] as number) ?? 100) as unknown as T[];
      },
    },
    store,
  };
}

function asCursor(obj: unknown) {
  return obj as any;
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
  const repo = new LogQueueRepository(asCursor(cursor));
  const original = global.fetch;
  global.fetch = async () => {
    throw new Error("network down");
  };
  try {
    _resetTelemetry();
    initTelemetry({ endpoint: "http://loki.test", labels: { app: "app" } }, repo);
    getLokiClient()!.push("error", "checkout timeout");
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(store.length, 1);
    assert.equal(store[0].level, "error");
  } finally {
    global.fetch = original;
    _resetTelemetry();
  }
});

// eviction bound — a device offline for days must not grow the queue unbounded
test("LogQueueRepository: queue stays within maxSize after overflow", async () => {
  const { cursor, store } = makeCursor();
  const maxSize = 3;
  const repo = new LogQueueRepository(asCursor(cursor), maxSize, undefined, 1);

  for (let i = 0; i < 10; i++) await repo.enqueue("info", `msg-${i}`);

  assert.ok(
    store.length <= maxSize,
    `queue has ${store.length} rows but maxSize is ${maxSize}`,
  );
});

// eviction order — newest logs survive, oldest are dropped
test("LogQueueRepository: eviction removes oldest rows first", async () => {
  const { cursor, store } = makeCursor();
  const repo = new LogQueueRepository(asCursor(cursor), 2, undefined, 1);

  await repo.enqueue("info", "old");
  await repo.enqueue("info", "mid");
  await repo.enqueue("info", "new");

  assert.ok(
    store.some((r) => r.message === "new"),
    "newest log must survive",
  );
  assert.ok(!store.some((r) => r.message === "old"), "oldest log must be evicted");
});

// severity-aware eviction — low-severity logs are dropped before error/warn
test("LogQueueRepository: drops debug/info before error under pressure", async () => {
  const { cursor, store } = makeCursor();
  const repo = new LogQueueRepository(asCursor(cursor), 2, undefined, 1);

  await repo.enqueue("error", "boom"); // oldest, but high severity
  await repo.enqueue("debug", "noise-1");
  await repo.enqueue("info", "noise-2"); // overflow (cap 2) → drop lowest severity first

  assert.ok(
    store.some((r) => r.message === "boom"),
    "error must survive even though it is the oldest",
  );
  assert.ok(!store.some((r) => r.message === "noise-1"), "debug must be evicted first");
});

test("LogQueueRepository: error survives a flood of info logs", async () => {
  const { cursor, store } = makeCursor();
  const repo = new LogQueueRepository(asCursor(cursor), 3, undefined, 1);

  await repo.enqueue("error", "critical");
  for (let i = 0; i < 20; i++) await repo.enqueue("info", `info-${i}`);

  assert.ok(
    store.some((r) => r.message === "critical"),
    "the single error must still be buffered after an info flood",
  );
  assert.ok(store.length <= 3, "queue stayed within cap");
});

test("LogQueueRepository: among same severity, oldest is dropped first", async () => {
  const { cursor, store } = makeCursor();
  const repo = new LogQueueRepository(asCursor(cursor), 2, undefined, 1);

  await repo.enqueue("info", "old");
  await repo.enqueue("info", "mid");
  await repo.enqueue("info", "new");

  assert.ok(!store.some((r) => r.message === "old"), "oldest within tier dropped first");
  assert.ok(
    store.some((r) => r.message === "new"),
    "newest survives",
  );
});

// byte budget — large LOW-value payloads are shed first, small ERRORs survive.
// This is the test that would FAIL under severity-first byte eviction (which
// would delete the small errors trying to protect... and free almost nothing).
test("LogQueueRepository: byte pressure sheds large debug blobs, keeps small errors", async () => {
  const { cursor, store } = makeCursor();
  const blob = "x".repeat(2000);
  // Row cap generous; byte cap small so only byte pressure triggers.
  const repo = new LogQueueRepository(asCursor(cursor), 1000, 2500, 1);

  await repo.enqueue("error", "e1"); // small, high value
  await repo.enqueue("error", "e2"); // small, high value
  await repo.enqueue("debug", blob); // large, low value
  await repo.enqueue("debug", blob); // large, low value → byte pressure

  const { approxBytes } = await repo.stats();
  assert.ok(approxBytes <= 2500, `over byte budget: ${approxBytes}`);
  assert.ok(
    store.some((r) => r.message === "e1") && store.some((r) => r.message === "e2"),
    "small errors must survive — large blobs are the byte problem and go first",
  );
});

// pathological: ONE oversized payload bigger than the whole budget. It cannot be
// protected (it IS the overage), but the queue must NOT be annihilated — the many
// small rows survive. (Under the old avg-based severity-first math the queue
// emptied completely.)
test("LogQueueRepository: one huge payload is dropped without wiping the small rows", async () => {
  const { cursor, store } = makeCursor();
  const huge = "x".repeat(50_000);
  const repo = new LogQueueRepository(asCursor(cursor), 1000, 5000, 1);

  for (let i = 0; i < 50; i++) await repo.enqueue("info", `small-${i}`); // ~50 tiny rows
  await repo.enqueue("error", huge); // 50KB — alone blows the 5KB budget

  const { rows, approxBytes } = await repo.stats();
  assert.ok(approxBytes <= 5000, `over byte budget: ${approxBytes}`);
  assert.ok(rows >= 40, `expected the small rows to survive, only ${rows} left`);
  assert.ok(!store.some((r) => r.message === huge), "the oversized payload was dropped");
});

// byte budget basic — queue is brought under the byte cap
test("LogQueueRepository: evicts on byte budget even below the row count", async () => {
  const { cursor } = makeCursor();
  const big = "x".repeat(1000);
  const repo = new LogQueueRepository(asCursor(cursor), 1000, 1500, 1); // tiny byte cap

  await repo.enqueue("error", big);
  await repo.enqueue("error", big);
  await repo.enqueue("error", big);

  const { approxBytes } = await repo.stats();
  assert.ok(approxBytes <= 1500, `approxBytes ${approxBytes} exceeds byte budget 1500`);
});

// stats — surfaces rows, bytes and accumulated drop pressure
test("LogQueueRepository: stats reports rows, bytes and dropped count", async () => {
  const { cursor } = makeCursor();
  const repo = new LogQueueRepository(asCursor(cursor), 2, 1_000_000, 1);

  await repo.enqueue("info", "a");
  await repo.enqueue("info", "b");
  await repo.enqueue("info", "c"); // overflow → drop oldest

  const s = await repo.stats();
  assert.ok(s.rows <= 2, `rows ${s.rows} should be within budget`);
  assert.ok(s.approxBytes > 0, "approxBytes should be positive");
  assert.ok(s.dropped >= 1, "should report at least one dropped row");
});
