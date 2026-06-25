import assert from "node:assert/strict";
import test from "node:test";

import type { SpanRow } from "../../sincpro_mobile/infrastructure/telemetry/tracing/span_queue_repository.ts";
import { SpanQueueRepository } from "../../sincpro_mobile/infrastructure/telemetry/tracing/span_queue_repository.ts";
import { SpanSampler } from "../../sincpro_mobile/infrastructure/telemetry/tracing/span_sampler.ts";

function makeCursor() {
  const rows: SpanRow[] = [];
  let seq = 1;

  const cursor = {
    async mutateDatabase(query: string, ...params: unknown[]) {
      const q = query.trim().toUpperCase();

      if (q.startsWith("INSERT")) {
        const [
          trace_id,
          span_id,
          parent_span_id,
          name,
          kind,
          start_time_unixnano,
          end_time_unixnano,
          attributes,
          status_code,
          status_message,
          resource_attrs,
        ] = params as [
          string,
          string,
          string | null,
          string,
          number,
          string,
          string,
          string,
          number,
          string,
          string,
        ];
        const id = seq++;
        rows.push({
          id,
          trace_id,
          span_id,
          parent_span_id: parent_span_id ?? null,
          name,
          kind,
          start_time_unixnano,
          end_time_unixnano,
          attributes,
          status_code,
          status_message,
          resource_attrs,
          created_at: "2026-06-24 00:00:00",
        });
        return { changes: 1, lastInsertRowId: id };
      }

      // trace-coherent eviction: drop the oldest WHOLE trace
      if (q.startsWith("DELETE") && q.includes("GROUP BY TRACE_ID")) {
        if (rows.length === 0) return { changes: 0, lastInsertRowId: 0 };
        const minIdByTrace = new Map<string, number>();
        for (const r of rows) {
          const cur = minIdByTrace.get(r.trace_id);
          if (cur === undefined || r.id < cur) minIdByTrace.set(r.trace_id, r.id);
        }
        let oldestTrace = "";
        let oldestMin = Infinity;
        for (const [t, minId] of minIdByTrace) {
          if (minId < oldestMin) {
            oldestMin = minId;
            oldestTrace = t;
          }
        }
        let removed = 0;
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i].trace_id === oldestTrace) {
            rows.splice(i, 1);
            removed++;
          }
        }
        return { changes: removed, lastInsertRowId: 0 };
      }

      // removeMany
      if (q.startsWith("DELETE") && q.includes("IN (")) {
        const ids = new Set(params as number[]);
        let removed = 0;
        for (let i = rows.length - 1; i >= 0; i--) {
          if (ids.has(rows[i].id)) {
            rows.splice(i, 1);
            removed++;
          }
        }
        return { changes: removed, lastInsertRowId: 0 };
      }

      return { changes: 0, lastInsertRowId: 0 };
    },

    async getFirstAsync<T>(_query: string, ..._params: unknown[]): Promise<T> {
      const bytes = rows.reduce(
        (acc, r) =>
          acc +
          r.trace_id.length +
          r.span_id.length +
          (r.parent_span_id ?? "").length +
          r.name.length +
          r.start_time_unixnano.length +
          r.end_time_unixnano.length +
          r.attributes.length +
          r.status_message.length +
          r.resource_attrs.length,
        0,
      );
      return { rows: rows.length, bytes } as unknown as T;
    },

    async getAllAsync<T>(_query: string, ...params: unknown[]): Promise<T[]> {
      const limit = (params[0] as number) ?? rows.length;
      return rows.slice(0, limit) as unknown as T[];
    },
  };

  return { rows, cursor: cursor as never };
}

function makeSpanInput(overrides: Partial<SpanRow> = {}) {
  return {
    trace_id: "aaaabbbbccccdddd0000111122223333",
    span_id: "aabbccdd11223344",
    parent_span_id: null,
    name: "HTTP GET /orders",
    kind: 1,
    start_time_unixnano: "1750000000000000000",
    end_time_unixnano: "1750000000100000000",
    attributes: '{"http.method":"GET"}',
    status_code: 0,
    status_message: "",
    resource_attrs: '{"service.name":"sincpro-mobile"}',
    ...overrides,
  };
}

// removeMany selectivity — if this breaks, the flush job deletes wrong entries
test("SpanQueueRepository: removeMany deletes only the specified ids, leaves the rest", async () => {
  const { rows, cursor } = makeCursor();
  const repo = new SpanQueueRepository(cursor);

  await repo.enqueue(makeSpanInput({ span_id: "aa" }));
  await repo.enqueue(makeSpanInput({ span_id: "bb" }));
  await repo.enqueue(makeSpanInput({ span_id: "cc" }));

  const [first, , third] = rows;
  await repo.removeMany([first.id, third.id]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].span_id, "bb");
});

// empty removeMany must not crash — SQLite IN () is invalid syntax
test("SpanQueueRepository: removeMany with empty array is a no-op", async () => {
  const { rows, cursor } = makeCursor();
  const repo = new SpanQueueRepository(cursor);
  await repo.enqueue(makeSpanInput());
  await repo.removeMany([]);
  assert.equal(rows.length, 1);
});

// eviction bound — device offline for days must not grow unbounded
test("SpanQueueRepository: queue stays within maxRows after overflow", async () => {
  const { rows, cursor } = makeCursor();
  const maxRows = 3;
  const repo = new SpanQueueRepository(cursor, maxRows, undefined, 1);

  for (let i = 0; i < 6; i++) {
    await repo.enqueue(makeSpanInput({ trace_id: `trace-${i}`, span_id: `s-${i}` }));
  }

  assert.ok(
    rows.length <= maxRows,
    `queue has ${rows.length} rows but maxRows is ${maxRows}`,
  );
});

// trace-coherent eviction — the WHOLE oldest trace is dropped, never partial,
// so survivors stay complete and no orphaned child spans are produced.
test("SpanQueueRepository: eviction drops whole oldest trace, survivors stay complete", async () => {
  const { rows, cursor } = makeCursor();
  const repo = new SpanQueueRepository(cursor, 3, undefined, 1); // budget: 3 rows

  // Trace A (root + child), then trace B (root + child) → 4 rows > 3
  await repo.enqueue(
    makeSpanInput({ trace_id: "A", span_id: "a-root", parent_span_id: null }),
  );
  await repo.enqueue(
    makeSpanInput({ trace_id: "A", span_id: "a-child", parent_span_id: "a-root" }),
  );
  await repo.enqueue(
    makeSpanInput({ trace_id: "B", span_id: "b-root", parent_span_id: null }),
  );
  await repo.enqueue(
    makeSpanInput({ trace_id: "B", span_id: "b-child", parent_span_id: "b-root" }),
  );

  assert.ok(!rows.some((r) => r.trace_id === "A"), "oldest trace A must be fully evicted");
  assert.equal(
    rows.filter((r) => r.trace_id === "B").length,
    2,
    "surviving trace B must keep BOTH spans",
  );
  // No orphans: every child's parent is still present within its trace.
  for (const r of rows) {
    if (r.parent_span_id) {
      assert.ok(
        rows.some((x) => x.trace_id === r.trace_id && x.span_id === r.parent_span_id),
        `span ${r.span_id} is orphaned — parent ${r.parent_span_id} is missing`,
      );
    }
  }
});

// amortization — eviction scan runs once every `evictEvery` ops, so the queue
// may briefly exceed the cap, then gets trimmed on the check tick.
test("SpanQueueRepository: eviction is amortized to every evictEvery enqueues", async () => {
  const { rows, cursor } = makeCursor();
  const repo = new SpanQueueRepository(cursor, 1, undefined, 3); // cap 1, check every 3

  await repo.enqueue(makeSpanInput({ trace_id: "t1", span_id: "s1" }));
  await repo.enqueue(makeSpanInput({ trace_id: "t2", span_id: "s2" }));
  assert.equal(rows.length, 2, "cap exceeded between checks (amortized, not yet trimmed)");

  await repo.enqueue(makeSpanInput({ trace_id: "t3", span_id: "s3" })); // 3rd op → check
  assert.ok(rows.length <= 1, `trimmed back to cap on the check tick, got ${rows.length}`);
});

// byte budget — fat-attribute spans trip the byte cap before the row cap
test("SpanQueueRepository: evicts on byte budget even below the row count", async () => {
  const { cursor } = makeCursor();
  const fat = "x".repeat(1000);
  const repo = new SpanQueueRepository(cursor, 1000, 1500, 1); // tiny byte cap

  await repo.enqueue(makeSpanInput({ trace_id: "t1", attributes: fat }));
  await repo.enqueue(makeSpanInput({ trace_id: "t2", attributes: fat }));
  await repo.enqueue(makeSpanInput({ trace_id: "t3", attributes: fat }));

  const { approxBytes } = await repo.stats();
  assert.ok(approxBytes <= 1500, `approxBytes ${approxBytes} exceeds byte budget 1500`);
});

// stats — surfaces rows, bytes and accumulated drop pressure
test("SpanQueueRepository: stats reports rows, bytes and dropped count", async () => {
  const { cursor } = makeCursor();
  const repo = new SpanQueueRepository(cursor, 2, 1_000_000, 1);

  await repo.enqueue(makeSpanInput({ trace_id: "t1", span_id: "s1" }));
  await repo.enqueue(makeSpanInput({ trace_id: "t2", span_id: "s2" }));
  await repo.enqueue(makeSpanInput({ trace_id: "t3", span_id: "s3" })); // overflow → drop t1

  const s = await repo.stats();
  assert.ok(s.rows <= 2, `rows ${s.rows} should be within budget`);
  assert.ok(s.approxBytes > 0, "approxBytes should be positive");
  assert.ok(s.dropped >= 1, "should report at least one dropped row");
});

// head sampling — keeps everything below the pressure threshold
test("SpanQueueRepository: sampler keeps all traces while buffer is not under pressure", async () => {
  const { rows, cursor } = makeCursor();
  // large budget → never reaches PRESSURE_FRACTION; keepOneInN aggressive
  const repo = new SpanQueueRepository(cursor, 1000, 1_000_000, 1, new SpanSampler(2));

  for (let i = 0; i < 20; i++) {
    await repo.enqueue(makeSpanInput({ trace_id: `t${i}`, span_id: `s${i}` }));
  }
  assert.equal(rows.length, 20, "nothing sampled out below the pressure threshold");
});

// head sampling — under pressure, NEW traces are dropped whole (coherent),
// and whatever is buffered remains complete (no orphaned child spans).
test("SpanQueueRepository: under pressure sampling drops whole new traces, survivors stay complete", async () => {
  const { rows, cursor } = makeCursor();
  // cap 4 rows, check every enqueue, keep 1-in-2 under pressure (>=80% of 4 ⇒ 4 rows wait,
  // 0.8*4 = 3.2 so pressure triggers once lastRows >= 4). Seed to pressure first.
  const repo = new SpanQueueRepository(cursor, 4, 1_000_000, 1, new SpanSampler(2, 100_000));

  // Fill to/over the row budget so the next measure() marks pressure.
  for (let i = 0; i < 6; i++) {
    await repo.enqueue(
      makeSpanInput({ trace_id: `seed${i}`, span_id: `a`, parent_span_id: null }),
    );
    await repo.enqueue(
      makeSpanInput({ trace_id: `seed${i}`, span_id: `b`, parent_span_id: "a" }),
    );
  }

  // Now under pressure: push many NEW traces; some are sampled out at head.
  let attempted = 0;
  for (let i = 0; i < 40; i++) {
    attempted++;
    await repo.enqueue(
      makeSpanInput({ trace_id: `new${i}`, span_id: "root", parent_span_id: null }),
    );
    await repo.enqueue(
      makeSpanInput({ trace_id: `new${i}`, span_id: "child", parent_span_id: "root" }),
    );
  }

  // Coherence invariant on whatever survived: every child has its parent present
  // within the same trace.
  for (const r of rows) {
    if (r.parent_span_id) {
      assert.ok(
        rows.some((x) => x.trace_id === r.trace_id && x.span_id === r.parent_span_id),
        `orphaned span ${r.span_id} in trace ${r.trace_id}`,
      );
    }
  }
  // For every "new" trace present, BOTH spans must be present (whole-trace keep).
  const newTraces = new Set(
    rows.filter((r) => r.trace_id.startsWith("new")).map((r) => r.trace_id),
  );
  for (const t of newTraces) {
    assert.equal(
      rows.filter((r) => r.trace_id === t).length,
      2,
      `trace ${t} should keep both spans or none`,
    );
  }
  assert.ok(rows.length <= 4, `queue stayed within row budget, got ${rows.length}`);
  assert.ok(attempted === 40);

  // CRITICAL: prove the SAMPLER did work (not just eviction). Without head
  // sampling, `sampled` stays 0 and this assertion fails — so the test cannot
  // pass with feature C removed.
  const s = await repo.stats();
  assert.ok(s.sampled > 0, `expected spans refused at head by the sampler, got ${s.sampled}`);
});

// isolate sampling from eviction — pressure WITHOUT exceeding the budget, so
// eviction never runs; only the sampler can drop. Proves head sampling fires.
test("SpanQueueRepository: head sampling fires under pressure without any eviction", async () => {
  const { rows, cursor } = makeCursor();
  // maxRows 200; pressure at >=160 rows. Seed 160 then push 20 NEW traces:
  // even if all 20 were kept (180) we stay below 200, so eviction never runs.
  const repo = new SpanQueueRepository(cursor, 200, 1e9, 1, new SpanSampler(2, 100_000));

  for (let i = 0; i < 160; i++) {
    await repo.enqueue(makeSpanInput({ trace_id: `seed${i}`, span_id: `s${i}` }));
  }
  const before = (await repo.stats()).dropped;

  for (let i = 0; i < 20; i++) {
    await repo.enqueue(makeSpanInput({ trace_id: `new${i}`, span_id: "root" }));
  }
  const s = await repo.stats();

  assert.ok(s.sampled > 0, `sampler should have refused some traces, got ${s.sampled}`);
  assert.equal(s.dropped, before, "no eviction should have occurred (dropped unchanged)");
  assert.ok(rows.length <= 200, "stayed within budget");
});
