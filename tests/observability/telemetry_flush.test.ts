import assert from "node:assert/strict";
import test from "node:test";

import type {
  FlushClient,
  FlushJobState,
  FlushQueue,
} from "../../sincpro_mobile/infrastructure/telemetry/flush_job.ts";
import {
  createFlushJobState,
  FLUSH_BATCH_SIZE,
  MAX_BATCHES_PER_TICK,
  runFlushJob,
} from "../../sincpro_mobile/infrastructure/telemetry/flush_job.ts";

// ---------------------------------------------------------------------------
// In-memory store — simulates the SQLite queue for flush job tests
// ---------------------------------------------------------------------------

interface Row {
  id: number;
  level: string;
  message: string;
  created_at: string;
}

function makeStore(initialCount = 0) {
  const rows: Row[] = [];
  let seq = 1;

  for (let i = 0; i < initialCount; i++) {
    rows.push({
      id: seq++,
      level: "info",
      message: `msg-${i}`,
      created_at: "2026-06-24 00:00:00",
    });
  }

  const queue: FlushQueue = {
    async pruneExpired() {},
    async findPending(limit) {
      return rows.slice(0, limit) as Row[];
    },
    async removeMany(ids) {
      const set = new Set(ids);
      for (let i = rows.length - 1; i >= 0; i--) {
        if (set.has(rows[i].id)) rows.splice(i, 1);
      }
    },
  };

  return { rows, queue };
}

function successClient(): FlushClient {
  return { async deliver() {} };
}

function failingClient(): { calls: number; client: FlushClient } {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    client: {
      async deliver() {
        calls++;
        throw new Error("Loki unavailable");
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Batch draining
// ---------------------------------------------------------------------------

test("runFlushJob: drains queue in one tick when entries fit in one batch", async () => {
  const { rows, queue } = makeStore(50);
  const state = createFlushJobState();

  await runFlushJob(successClient(), queue, state);

  assert.equal(rows.length, 0, "all 50 entries removed after flush");
});

test("runFlushJob: drains multiple batches per tick up to MAX_BATCHES_PER_TICK", async () => {
  const total = FLUSH_BATCH_SIZE * MAX_BATCHES_PER_TICK; // exactly fills all batches
  const { rows, queue } = makeStore(total);
  const state = createFlushJobState();

  await runFlushJob(successClient(), queue, state);

  assert.equal(rows.length, 0, `${total} entries fully drained in one tick`);
});

test("runFlushJob: stops after MAX_BATCHES_PER_TICK even if more entries remain", async () => {
  const overflow = FLUSH_BATCH_SIZE * MAX_BATCHES_PER_TICK + 1; // one more than the cap
  const { rows, queue } = makeStore(overflow);
  const state = createFlushJobState();

  await runFlushJob(successClient(), queue, state);

  assert.equal(rows.length, 1, "one entry remains — will be delivered in the next tick");
});

test("runFlushJob: stops early when last batch is smaller than FLUSH_BATCH_SIZE", async () => {
  // 150 entries = 1 full batch (100) + 1 partial (50) → should drain all in one tick
  const { rows, queue } = makeStore(150);
  const state = createFlushJobState();

  await runFlushJob(successClient(), queue, state);

  assert.equal(rows.length, 0, "partial last batch signals queue empty — all drained");
});

test("runFlushJob: does nothing when queue is empty", async () => {
  const { queue } = makeStore(0);
  const state = createFlushJobState();
  let deliverCalled = false;
  const client: FlushClient = {
    async deliver() {
      deliverCalled = true;
    },
  };

  await runFlushJob(client, queue, state);

  assert.ok(!deliverCalled, "deliver must not be called on empty queue");
});

// ---------------------------------------------------------------------------
// Delivery ordering — at-least-once guarantee
// ---------------------------------------------------------------------------

test("runFlushJob: removeMany is called only after deliver succeeds", async () => {
  const calls: string[] = [];
  const { rows, queue: baseQueue } = makeStore(5);

  const trackedQueue: FlushQueue = {
    async pruneExpired() {},
    async findPending(limit) {
      return baseQueue.findPending(limit);
    },
    async removeMany(ids) {
      calls.push("removeMany");
      return baseQueue.removeMany(ids);
    },
  };

  const client: FlushClient = {
    async deliver() {
      calls.push("deliver");
    },
  };

  await runFlushJob(client, trackedQueue, createFlushJobState());

  assert.deepEqual(calls, ["deliver", "removeMany"], "deliver must precede removeMany");
  assert.equal(rows.length, 0);
});

test("runFlushJob: entries stay in queue when deliver throws (no data loss)", async () => {
  const { rows, queue } = makeStore(10);
  const { client } = failingClient();
  const state = createFlushJobState();

  await runFlushJob(client, queue, state);

  assert.equal(rows.length, 10, "all entries preserved when delivery fails");
});

// ---------------------------------------------------------------------------
// Backoff on consecutive failures
// ---------------------------------------------------------------------------

test("runFlushJob: increments consecutiveFailures on deliver failure", async () => {
  const { queue } = makeStore(5);
  const { client } = failingClient();
  const state = createFlushJobState();

  await runFlushJob(client, queue, state);

  assert.equal(state.consecutiveFailures, 1);
});

test("runFlushJob: sets skipTicksRemaining = 1 after first failure (retry in 2 min)", async () => {
  const { queue } = makeStore(5);
  const { client } = failingClient();
  const state = createFlushJobState();

  await runFlushJob(client, queue, state);

  assert.equal(state.skipTicksRemaining, 1, "first failure → skip 1 tick");
});

test("runFlushJob: backoff doubles after each consecutive failure", async () => {
  const state = createFlushJobState();

  for (let fail = 1; fail <= 5; fail++) {
    const { queue } = makeStore(5);
    const { client } = failingClient();
    await runFlushJob(client, queue, state);

    const expectedSkip = Math.min(Math.pow(2, fail - 1), 32);
    assert.equal(
      state.skipTicksRemaining,
      expectedSkip,
      `after failure ${fail}: skipTicksRemaining should be ${expectedSkip}`,
    );

    // consume the skip ticks so the next call actually runs
    state.skipTicksRemaining = 0;
  }
});

test("runFlushJob: skips execution while skipTicksRemaining > 0", async () => {
  const { queue } = makeStore(5);
  let deliverCalled = false;
  const client: FlushClient = {
    async deliver() {
      deliverCalled = true;
    },
  };
  const state: FlushJobState = { consecutiveFailures: 1, skipTicksRemaining: 3 };

  await runFlushJob(client, queue, state);

  assert.ok(!deliverCalled, "deliver must not run during backoff period");
  assert.equal(state.skipTicksRemaining, 2, "each tick decrements the skip counter");
});

test("runFlushJob: resets consecutiveFailures to 0 after successful delivery", async () => {
  const { queue } = makeStore(5);
  const state: FlushJobState = { consecutiveFailures: 4, skipTicksRemaining: 0 };

  await runFlushJob(successClient(), queue, state);

  assert.equal(state.consecutiveFailures, 0, "successful flush resets failure counter");
});

test("runFlushJob: backoff is capped at 32 skip ticks regardless of failure count", async () => {
  const state: FlushJobState = { consecutiveFailures: 100, skipTicksRemaining: 0 };
  const { queue } = makeStore(5);
  const { client } = failingClient();

  await runFlushJob(client, queue, state);

  assert.equal(state.skipTicksRemaining, 32, "backoff never exceeds 32 ticks");
});
