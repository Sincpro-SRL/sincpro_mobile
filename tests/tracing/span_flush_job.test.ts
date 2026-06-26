import assert from "node:assert/strict";
import test from "node:test";

import type {
  SpanFlushClient,
  SpanFlushJobState,
  SpanFlushQueue,
} from "../../sincpro_mobile/infrastructure/telemetry/tracing/span_flush_job.ts";
import {
  createSpanFlushJobState,
  runSpanFlushJob,
  SPAN_FLUSH_BATCH_SIZE,
  SPAN_MAX_BATCHES_PER_TICK,
} from "../../sincpro_mobile/infrastructure/telemetry/tracing/span_flush_job.ts";
import type { SpanRow } from "../../sincpro_mobile/infrastructure/telemetry/tracing/span_queue_repository.ts";

function makeRow(id: number): SpanRow {
  return {
    id,
    trace_id: "aaaa",
    span_id: `span-${id}`,
    parent_span_id: null,
    name: "op",
    kind: 1,
    start_time_unixnano: "1750000000000000000",
    end_time_unixnano: "1750000000100000000",
    attributes: "{}",
    status_code: 0,
    status_message: "",
    resource_attrs: "{}",
    events: "[]",
    links: "[]",
    created_at: "2026-06-24 00:00:00",
  };
}

function makeStore(count: number) {
  const rows: SpanRow[] = Array.from({ length: count }, (_, i) => makeRow(i + 1));

  const queue: SpanFlushQueue = {
    async pruneExpired() {},
    async findPending(limit) {
      return rows.slice(0, limit);
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

function successClient(): SpanFlushClient {
  return { async deliver() {} };
}

function failingClient() {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    client: {
      async deliver() {
        calls++;
        throw new Error("OTLP unavailable");
      },
    } as SpanFlushClient,
  };
}

// ---------------------------------------------------------------------------
// Batch draining
// ---------------------------------------------------------------------------

test("runSpanFlushJob: drains queue in one tick when entries fit in one batch", async () => {
  const { rows, queue } = makeStore(50);
  await runSpanFlushJob(successClient(), queue, createSpanFlushJobState());
  assert.equal(rows.length, 0);
});

test("runSpanFlushJob: drains multiple batches up to SPAN_MAX_BATCHES_PER_TICK", async () => {
  const { rows, queue } = makeStore(SPAN_FLUSH_BATCH_SIZE * SPAN_MAX_BATCHES_PER_TICK);
  await runSpanFlushJob(successClient(), queue, createSpanFlushJobState());
  assert.equal(rows.length, 0);
});

test("runSpanFlushJob: caps at SPAN_MAX_BATCHES_PER_TICK — leaves remainder", async () => {
  const { rows, queue } = makeStore(SPAN_FLUSH_BATCH_SIZE * SPAN_MAX_BATCHES_PER_TICK + 1);
  await runSpanFlushJob(successClient(), queue, createSpanFlushJobState());
  assert.equal(rows.length, 1);
});

test("runSpanFlushJob: does nothing on empty queue", async () => {
  const { queue } = makeStore(0);
  let called = false;
  const client: SpanFlushClient = {
    async deliver() {
      called = true;
    },
  };
  await runSpanFlushJob(client, queue, createSpanFlushJobState());
  assert.ok(!called);
});

// ---------------------------------------------------------------------------
// At-least-once ordering
// ---------------------------------------------------------------------------

test("runSpanFlushJob: removeMany called only after deliver succeeds", async () => {
  const order: string[] = [];
  const { rows, queue: base } = makeStore(5);
  const queue: SpanFlushQueue = {
    async pruneExpired() {},
    async findPending(l) {
      return base.findPending(l);
    },
    async removeMany(ids) {
      order.push("remove");
      return base.removeMany(ids);
    },
  };
  const client: SpanFlushClient = {
    async deliver() {
      order.push("deliver");
    },
  };

  await runSpanFlushJob(client, queue, createSpanFlushJobState());

  assert.deepEqual(order, ["deliver", "remove"]);
  assert.equal(rows.length, 0);
});

test("runSpanFlushJob: spans preserved in queue on deliver failure", async () => {
  const { rows, queue } = makeStore(10);
  await runSpanFlushJob(failingClient().client, queue, createSpanFlushJobState());
  assert.equal(rows.length, 10);
});

// ---------------------------------------------------------------------------
// Backoff
// ---------------------------------------------------------------------------

test("runSpanFlushJob: consecutiveFailures increments on failure", async () => {
  const { queue } = makeStore(5);
  const state = createSpanFlushJobState();
  await runSpanFlushJob(failingClient().client, queue, state);
  assert.equal(state.consecutiveFailures, 1);
});

test("runSpanFlushJob: skipTicksRemaining = 1 after first failure", async () => {
  const { queue } = makeStore(5);
  const state = createSpanFlushJobState();
  await runSpanFlushJob(failingClient().client, queue, state);
  assert.equal(state.skipTicksRemaining, 1);
});

test("runSpanFlushJob: skips execution while skipTicksRemaining > 0", async () => {
  const { queue } = makeStore(5);
  let called = false;
  const client: SpanFlushClient = {
    async deliver() {
      called = true;
    },
  };
  const state: SpanFlushJobState = { consecutiveFailures: 1, skipTicksRemaining: 2 };

  await runSpanFlushJob(client, queue, state);

  assert.ok(!called);
  assert.equal(state.skipTicksRemaining, 1);
});

test("runSpanFlushJob: resets consecutiveFailures to 0 on success", async () => {
  const { queue } = makeStore(5);
  const state: SpanFlushJobState = { consecutiveFailures: 4, skipTicksRemaining: 0 };
  await runSpanFlushJob(successClient(), queue, state);
  assert.equal(state.consecutiveFailures, 0);
});

test("runSpanFlushJob: backoff capped at 32 skip ticks", async () => {
  const { queue } = makeStore(5);
  const state: SpanFlushJobState = { consecutiveFailures: 100, skipTicksRemaining: 0 };
  await runSpanFlushJob(failingClient().client, queue, state);
  assert.equal(state.skipTicksRemaining, 32);
});
