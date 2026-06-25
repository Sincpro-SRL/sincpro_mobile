import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ConnectivityState } from "../../sincpro_mobile/infrastructure/telemetry/connectivity_state.ts";
import { fetchWithTimeout } from "../../sincpro_mobile/infrastructure/telemetry/fetch_with_timeout.ts";
import { FlushTelemetry } from "../../sincpro_mobile/infrastructure/telemetry/flush_telemetry.ts";
import { TelemetrySignal } from "../../sincpro_mobile/infrastructure/telemetry/telemetry_signal.ts";

// ---------------------------------------------------------------------------
// Fakes — log/span queues + clients with the minimal shape the jobs need
// ---------------------------------------------------------------------------

function makeQueue<T extends { id: number }>(items: T[]) {
  const store = [...items];
  return {
    store,
    async pruneExpired() {},
    async findPending(limit: number) {
      return store.slice(0, limit);
    },
    async removeMany(ids: number[]) {
      const set = new Set(ids);
      for (let i = store.length - 1; i >= 0; i--)
        if (set.has(store[i].id)) store.splice(i, 1);
    },
  };
}

function okClient() {
  const sent: unknown[] = [];
  return {
    sent,
    async deliver(batch: unknown[]) {
      sent.push(...batch);
    },
  };
}

function failingClient() {
  const calls = { count: 0 };
  return {
    calls,
    async deliver() {
      calls.count++;
      throw new Error("network down");
    },
  };
}

const logEntry = (id: number) => ({
  id,
  level: "info",
  message: `m${id}`,
  created_at: "2026-06-24 00:00:00",
});

// ---------------------------------------------------------------------------
// ConnectivityState
// ---------------------------------------------------------------------------

describe("ConnectivityState", () => {
  it("defaults to online and toggles", () => {
    const c = new ConnectivityState();
    assert.equal(c.isOnline(), true);
    c.markOffline();
    assert.equal(c.isOnline(), false);
    c.markOnline();
    assert.equal(c.isOnline(), true);
  });
});

// ---------------------------------------------------------------------------
// FlushTelemetry
// ---------------------------------------------------------------------------

describe("FlushTelemetry", () => {
  it("drains both log and span queues on a normal run", async () => {
    const logQueue = makeQueue([logEntry(1), logEntry(2)]);
    const spanQueue = makeQueue([{ id: 1 }, { id: 2 }]);
    const logClient = okClient();
    const spanClient = okClient();
    const flush = new FlushTelemetry({
      connectivity: new ConnectivityState(),
      logClient,
      logQueue,
      spanClient,
      spanQueue: spanQueue as never,
    });

    await flush.run();

    assert.equal(logQueue.store.length, 0, "logs drained");
    assert.equal(spanQueue.store.length, 0, "spans drained");
    assert.equal(logClient.sent.length, 2);
    assert.equal(spanClient.sent.length, 2);
  });

  it("respects job backoff after a failure — does not hammer on the next run", async () => {
    const logQueue = makeQueue([logEntry(1)]);
    const logClient = failingClient();
    const flush = new FlushTelemetry({
      connectivity: new ConnectivityState(),
      logClient,
      logQueue,
    });

    await flush.run(); // attempt 1 → fails → backoff skips next run
    await flush.run(); // skipped by backoff (no delivery attempt)

    assert.equal(logClient.calls.count, 1, "second run was backoff-skipped, not retried");
    assert.equal(logQueue.store.length, 1, "entries kept (at-least-once)");
  });

  it("resetBackoff retries immediately, ignoring the backoff window", async () => {
    const logQueue = makeQueue([logEntry(1)]);
    const logClient = failingClient();
    const flush = new FlushTelemetry({
      connectivity: new ConnectivityState(),
      logClient,
      logQueue,
    });

    await flush.run(); // attempt 1 → fails → backoff armed
    await flush.run({ resetBackoff: true }); // backoff cleared → attempt 2 now

    assert.equal(logClient.calls.count, 2, "resetBackoff forced an immediate retry");
  });

  it("marks offline when delivery fails", async () => {
    const logQueue = makeQueue([logEntry(1)]);
    const connectivity = new ConnectivityState();
    const flush = new FlushTelemetry({ connectivity, logClient: failingClient(), logQueue });

    await flush.run();

    assert.equal(connectivity.isOnline(), false, "failure flips the flag offline");
    assert.equal(logQueue.store.length, 1, "entries kept on failure (at-least-once)");
  });

  it("recovers without cron or events — backoff elapses then the next run delivers", async () => {
    const logQueue = makeQueue([logEntry(1)]);
    // deliver fails the first time, succeeds afterwards (network came back)
    let failNext = true;
    const logClient = {
      sent: [] as unknown[],
      async deliver(batch: unknown[]) {
        if (failNext) {
          failNext = false;
          throw new Error("network down");
        }
        this.sent.push(...batch);
      },
    };
    const connectivity = new ConnectivityState();
    const flush = new FlushTelemetry({ connectivity, logClient, logQueue });

    await flush.run(); // fails → backoff = 1
    await flush.run(); // backoff skip (decrements to 0)
    await flush.run(); // attempts again → succeeds

    assert.equal(logQueue.store.length, 0, "backlog delivered after recovery");
    assert.equal(connectivity.isOnline(), true);
  });

  it("is re-entrant safe — overlapping runs do not double-deliver", async () => {
    const logQueue = makeQueue([logEntry(1), logEntry(2)]);
    const logClient = okClient();
    const flush = new FlushTelemetry({
      connectivity: new ConnectivityState(),
      logClient,
      logQueue,
    });

    await Promise.all([flush.run(), flush.run(), flush.run()]);

    assert.equal(logClient.sent.length, 2, "each entry delivered exactly once");
  });
});

// ---------------------------------------------------------------------------
// TelemetrySignal
// ---------------------------------------------------------------------------

describe("TelemetrySignal", () => {
  it("coalesces a burst of notify() into a single flush", async () => {
    let flushes = 0;
    const signal = new TelemetrySignal(() => {
      flushes++;
    }, 10);

    for (let i = 0; i < 20; i++) signal.notify();
    assert.equal(flushes, 0, "not fired synchronously");

    await new Promise((r) => setTimeout(r, 25));
    assert.equal(flushes, 1, "burst collapsed into one flush");
  });

  it("schedules again after the window elapses", async () => {
    let flushes = 0;
    const signal = new TelemetrySignal(() => {
      flushes++;
    }, 10);

    signal.notify();
    await new Promise((r) => setTimeout(r, 25));
    signal.notify();
    await new Promise((r) => setTimeout(r, 25));

    assert.equal(flushes, 2);
  });

  it("dispose() cancels a pending flush", async () => {
    let flushes = 0;
    const signal = new TelemetrySignal(() => {
      flushes++;
    }, 10);

    signal.notify();
    signal.dispose();
    await new Promise((r) => setTimeout(r, 25));

    assert.equal(flushes, 0);
  });
});

// ---------------------------------------------------------------------------
// fetchWithTimeout
// ---------------------------------------------------------------------------

describe("fetchWithTimeout", () => {
  it("aborts a hanging request instead of waiting forever", async () => {
    const original = global.fetch;
    // fetch that only settles when its signal aborts
    global.fetch = ((_input: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as typeof fetch;

    try {
      await assert.rejects(
        () => fetchWithTimeout("http://slow.test", { method: "POST" }, 20),
        /abort/i,
      );
    } finally {
      global.fetch = original;
    }
  });

  it("returns the response when fetch resolves in time", async () => {
    const original = global.fetch;
    global.fetch = (async () => new Response(null, { status: 204 })) as typeof fetch;
    try {
      const res = await fetchWithTimeout("http://fast.test", { method: "POST" }, 1000);
      assert.equal(res.status, 204);
    } finally {
      global.fetch = original;
    }
  });
});
