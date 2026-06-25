/** Keep 1 of every N traces while under pressure (default). */
export const DEFAULT_KEEP_ONE_IN_N = 4;
/** Bounded size of the per-trace decision cache. */
export const DEFAULT_DECISION_CACHE_SIZE = 2_000;

/**
 * Head sampler for spans, applied at ingest under sustained buffer pressure.
 *
 * The decision is **per trace and coherent**: every span sharing a `traceId`
 * gets the same keep/drop verdict, even if buffer pressure changes between the
 * arrival of one span and the next. This is what prevents partial/orphaned
 * traces — the failure mode that makes a trace backend show broken graphs.
 *
 * Coherence is achieved two ways:
 *  - the keep verdict for a new trace is a deterministic hash of its id
 *    (no RNG), so the same id always hashes the same bucket; and
 *  - the first verdict for a trace is cached, so a mid-trace pressure flip can
 *    never change an already-made decision.
 *
 * When NOT under pressure every trace is kept. The cache is bounded (oldest
 * decision evicted first). The cache is **LRU**: reading a trace's verdict
 * refreshes it, so a trace still actively receiving spans keeps its decision
 * resident and cannot be split by eviction. Only a trace idle long enough to
 * fall out of the cache *and* hitting a pressure change can be re-decided —
 * acceptable for best-effort telemetry.
 */
export class SpanSampler {
  private readonly keepOneInN: number;
  private readonly cacheSize: number;
  // insertion-ordered Map used as an LRU: most-recently-used key sits last.
  private readonly decisions = new Map<string, boolean>();

  constructor(keepOneInN = DEFAULT_KEEP_ONE_IN_N, cacheSize = DEFAULT_DECISION_CACHE_SIZE) {
    this.keepOneInN = Math.max(1, keepOneInN);
    this.cacheSize = Math.max(1, cacheSize);
  }

  /**
   * Returns whether the span belonging to `traceId` should be buffered.
   * @param underPressure - true when the buffer is near its budget; only then
   *   does sampling drop anything.
   */
  shouldKeep(traceId: string, underPressure: boolean): boolean {
    const cached = this.decisions.get(traceId);
    if (cached !== undefined) {
      // Touch — move to MRU position so active traces are never evicted.
      this.decisions.delete(traceId);
      this.decisions.set(traceId, cached);
      return cached;
    }

    // keepOneInN === 1 means "keep all" even under pressure.
    const keep =
      !underPressure || this.keepOneInN === 1 || hash(traceId) % this.keepOneInN === 0;
    this.remember(traceId, keep);
    return keep;
  }

  /** Current number of cached trace decisions (for observability / tests). */
  size(): number {
    return this.decisions.size;
  }

  private remember(traceId: string, keep: boolean): void {
    if (this.decisions.size >= this.cacheSize) {
      // Evict the least-recently-used decision (first key in insertion order).
      const lru = this.decisions.keys().next().value;
      if (lru !== undefined) this.decisions.delete(lru);
    }
    this.decisions.set(traceId, keep);
  }
}

/** FNV-1a 32-bit — deterministic, fast, no allocations. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0; // unsigned
}
