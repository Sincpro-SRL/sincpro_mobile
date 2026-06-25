import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SpanSampler } from "../../sincpro_mobile/infrastructure/telemetry/tracing/span_sampler.ts";

describe("SpanSampler", () => {
  it("keeps every trace when not under pressure", () => {
    const sampler = new SpanSampler(4);
    for (let i = 0; i < 100; i++) {
      assert.equal(sampler.shouldKeep(`trace-${i}`, false), true);
    }
  });

  it("keeps close to 1 in N under pressure (FNV distribution)", () => {
    const sampler = new SpanSampler(4, 100_000);
    let kept = 0;
    const total = 8000;
    for (let i = 0; i < total; i++) {
      if (sampler.shouldKeep(`trace-${i}`, true)) kept++;
    }
    const rate = kept / total;
    // Expect ~0.25; assert it is genuinely near 1/N, not just "less than half".
    assert.ok(
      rate > 0.2 && rate < 0.3,
      `keep rate ${rate.toFixed(3)} not within [0.2, 0.3] of expected 0.25`,
    );
  });

  it("COHERENCE: a trace's verdict is identical across repeated spans", () => {
    const sampler = new SpanSampler(4, 100_000);
    for (let i = 0; i < 500; i++) {
      const id = `trace-${i}`;
      const first = sampler.shouldKeep(id, true);
      // simulate 5 more spans of the same trace arriving later
      for (let s = 0; s < 5; s++) {
        assert.equal(sampler.shouldKeep(id, true), first, `verdict flipped for ${id}`);
      }
    }
  });

  it("COHERENCE: verdict does not flip when pressure changes mid-trace", () => {
    const sampler = new SpanSampler(4, 100_000);
    // First span arrives WITHOUT pressure → kept and cached.
    const id = "long-lived-trace";
    assert.equal(sampler.shouldKeep(id, false), true);
    // Later spans arrive UNDER pressure — must still be kept (decision cached).
    for (let s = 0; s < 10; s++) {
      assert.equal(
        sampler.shouldKeep(id, true),
        true,
        "a trace already accepted must stay accepted under later pressure",
      );
    }
  });

  it("deterministic — same id hashes to the same verdict across instances", () => {
    const a = new SpanSampler(4, 100_000);
    const b = new SpanSampler(4, 100_000);
    for (let i = 0; i < 200; i++) {
      const id = `t-${i}`;
      assert.equal(a.shouldKeep(id, true), b.shouldKeep(id, true), `mismatch for ${id}`);
    }
  });

  it("keepOneInN = 1 keeps everything even under pressure", () => {
    const sampler = new SpanSampler(1);
    for (let i = 0; i < 100; i++) {
      assert.equal(sampler.shouldKeep(`t-${i}`, true), true);
    }
  });

  it("bounded cache never exceeds its configured size", () => {
    const cacheSize = 10;
    const sampler = new SpanSampler(4, cacheSize);
    for (let i = 0; i < 1000; i++) sampler.shouldKeep(`t-${i}`, true);
    assert.ok(
      sampler.size() <= cacheSize,
      `cache grew to ${sampler.size()}, expected <= ${cacheSize}`,
    );
  });

  it("COHERENCE under cache pressure: an ACTIVE trace (LRU) is never re-decided", () => {
    // This test must DISCRIMINATE LRU from FIFO. The trap: if the hot trace is
    // first decided UNDER pressure, the deterministic hash gives the same verdict
    // on any re-decision, so FIFO would pass too. To make eviction observable we:
    //   1. pick a hot id that WOULD be dropped under pressure (hash bucket != 0), and
    //   2. give it its first verdict WITHOUT pressure → KEEP (true), cached.
    // Now if its cached decision is ever evicted and re-decided under pressure it
    // would flip to DROP. LRU keeps the actively-touched trace resident (no flip);
    // FIFO would evict it after `cacheSize` churns and flip it.

    // Find an id the sampler drops under pressure (behavioural probe of the hash).
    const probe = new SpanSampler(2, 100_000);
    let hot = "";
    for (let i = 0; i < 10_000; i++) {
      const id = `probe-${i}`;
      if (!probe.shouldKeep(id, true)) {
        hot = id;
        break;
      }
    }
    assert.ok(hot, "expected to find an id that drops under pressure");

    const sampler = new SpanSampler(2, 5); // tiny cache
    assert.equal(sampler.shouldKeep(hot, false), true, "first verdict (no pressure) = keep");

    for (let round = 0; round < 200; round++) {
      sampler.shouldKeep(`churn-${round}`, true); // churn evicts the LRU entry
      // Touch hot under pressure. LRU: cache hit → stays KEEP. FIFO: after 5
      // churns hot is evicted → miss → re-decided under pressure → DROP (flip).
      assert.equal(
        sampler.shouldKeep(hot, true),
        true,
        `hot trace verdict flipped at round ${round} (LRU not holding it resident)`,
      );
    }
  });
});
