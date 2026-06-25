import type { DBCursor } from "@sincpro/mobile/infrastructure/database";

import type { BufferStats } from "../types.ts";

export interface LogEntry {
  id: number;
  level: string;
  message: string;
  created_at: string;
}

/** Max rows kept in telemetry_queue before eviction kicks in. */
export const MAX_LOG_QUEUE_SIZE = 5_000;
/** Max approximate payload bytes kept in telemetry_queue (~2 MB). */
export const MAX_LOG_QUEUE_BYTES = 2_000_000;
/** Run the (scanning) eviction check once every N enqueues — see class doc. */
export const EVICT_CHECK_EVERY = 32;

/**
 * Drop priority by level — LOWER is evicted FIRST. So under pressure debug/info
 * go before warn, and error survives longest. Unknown levels fall back to
 * {@link DEFAULT_DROP_PRIORITY}. Keys are the lowercase level strings the logger
 * persists.
 */
export const LOG_LEVEL_DROP_PRIORITY: Readonly<Record<string, number>> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};
const DEFAULT_DROP_PRIORITY = 1; // treat unknown levels like "info"

/**
 * SQL `CASE` mapping level → drop priority, built from {@link LOG_LEVEL_DROP_PRIORITY}
 * so the policy has a single source of truth. Values are integers and keys are
 * fixed lowercase ASCII from our own constant — no injection surface.
 */
function severityCaseSql(): string {
  const whens = Object.entries(LOG_LEVEL_DROP_PRIORITY)
    .map(([level, rank]) => `WHEN '${level}' THEN ${rank}`)
    .join(" ");
  return `CASE lower(level) ${whens} ELSE ${DEFAULT_DROP_PRIORITY} END`;
}

/**
 * Offline-first log buffer, bounded by BOTH a row count and a payload-byte
 * budget. When either is exceeded, rows are evicted **lowest-severity-first**
 * (debug → info → warn → error), oldest-first within a severity — so error/warn
 * logs survive longest under sustained offline pressure.
 *
 * The budget check scans the table, so it runs **amortized** — once every
 * `evictEvery` enqueues — to keep the hot path cheap. The bound is therefore
 * soft: the queue may transiently exceed the cap by up to `evictEvery` rows.
 *
 * Telemetry is best-effort: under sustained offline pressure logs ARE dropped,
 * but the loss is bounded, severity-aware, and observable (see {@link stats}).
 * Business-critical data must NOT live here.
 */
export class LogQueueRepository {
  private readonly db: typeof DBCursor;
  private readonly maxRows: number;
  private readonly maxBytes: number;
  private readonly evictEvery: number;
  private ops = 0;
  private dropped = 0;

  constructor(
    db: typeof DBCursor,
    maxRows = MAX_LOG_QUEUE_SIZE,
    maxBytes = MAX_LOG_QUEUE_BYTES,
    evictEvery = EVICT_CHECK_EVERY,
  ) {
    this.db = db;
    this.maxRows = maxRows;
    this.maxBytes = maxBytes;
    this.evictEvery = Math.max(1, evictEvery);
  }

  async enqueue(level: string, message: string): Promise<void> {
    await this.db.mutateDatabase(
      `INSERT INTO telemetry_queue (level, message) VALUES (?, ?)`,
      level,
      message,
    );

    if (++this.ops >= this.evictEvery) {
      this.ops = 0;
      await this.evict();
    }
  }

  /**
   * Brings the queue under both budgets. The two budgets use DIFFERENT victim
   * policies on purpose:
   *
   *  - Row pressure → **severity-aware**: drop lowest-severity, oldest-first.
   *    Each deletion reduces the count by exactly one, so this is exact.
   *  - Byte pressure → **largest-first**, reclaiming ACTUAL bytes. Severity is
   *    deliberately NOT used here: when the overage is caused by one oversized
   *    payload, protecting it (severity-first) forces deleting everything else
   *    to free its bytes, annihilating the queue to clear an overage that row
   *    itself caused. Largest-first targets the cause directly, so the maximum
   *    number of (small, information-dense) entries survive. Corollary: a huge
   *    high-severity payload is NOT protected from byte eviction — keep large
   *    blobs out of logs.
   *
   * Terminates: each pass removes ≥1 row (count strictly decreases) or returns.
   */
  private async evict(): Promise<void> {
    for (;;) {
      const { rows, approxBytes } = await this.measure();
      if (rows <= this.maxRows && approxBytes <= this.maxBytes) return;

      const removed =
        rows > this.maxRows
          ? await this.dropBySeverity(rows - this.maxRows)
          : await this.dropLargestUntilBytesFreed(approxBytes - this.maxBytes);

      if (removed === 0) return;
      this.dropped += removed;
    }
  }

  /** Deletes `n` rows lowest-severity-first, oldest-first within a tier. */
  private async dropBySeverity(n: number): Promise<number> {
    const res = await this.db.mutateDatabase(
      `DELETE FROM telemetry_queue WHERE id IN (
         SELECT id FROM telemetry_queue ORDER BY ${severityCaseSql()} ASC, id ASC LIMIT ?
       )`,
      n,
    );
    return (res as { changes?: number } | undefined)?.changes ?? 0;
  }

  /**
   * Deletes the largest rows (oldest as tiebreak) until at least `overage` bytes
   * are reclaimed, using each row's ACTUAL size. Returns rows removed.
   */
  private async dropLargestUntilBytesFreed(overage: number): Promise<number> {
    const candidates = await this.db.getAllAsync<{ id: number; len: number }>(
      `SELECT id, (length(level) + length(message)) AS len
         FROM telemetry_queue ORDER BY (length(level) + length(message)) DESC, id ASC LIMIT 500`,
    );
    if (candidates.length === 0) return 0;

    const ids: number[] = [];
    let freed = 0;
    for (const c of candidates) {
      ids.push(c.id);
      freed += c.len;
      if (freed >= overage) break;
    }

    const placeholders = ids.map(() => "?").join(", ");
    const res = await this.db.mutateDatabase(
      `DELETE FROM telemetry_queue WHERE id IN (${placeholders})`,
      ...ids,
    );
    return (res as { changes?: number } | undefined)?.changes ?? ids.length;
  }

  private async measure(): Promise<{ rows: number; approxBytes: number }> {
    const row = await this.db.getFirstAsync<{ rows: number; bytes: number }>(
      `SELECT COUNT(*) AS rows,
        COALESCE(SUM(length(level) + length(message)), 0) AS bytes
       FROM telemetry_queue`,
    );
    return { rows: row?.rows ?? 0, approxBytes: row?.bytes ?? 0 };
  }

  async stats(): Promise<BufferStats> {
    const { rows, approxBytes } = await this.measure();
    // Logs are not head-sampled — `sampled` is always 0.
    return { rows, approxBytes, dropped: this.dropped, sampled: 0 };
  }

  async findPending(limit = 100): Promise<LogEntry[]> {
    return this.db.getAllAsync<LogEntry>(
      `SELECT id, level, message, created_at FROM telemetry_queue ORDER BY id ASC LIMIT ?`,
      limit,
    );
  }

  async removeMany(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => "?").join(", ");
    await this.db.mutateDatabase(
      `DELETE FROM telemetry_queue WHERE id IN (${placeholders})`,
      ...ids,
    );
  }

  /** Deletes entries older than `days` days. Called before each flush to bound queue growth. */
  async pruneExpired(days = 7): Promise<void> {
    await this.db.mutateDatabase(
      `DELETE FROM telemetry_queue WHERE created_at < datetime('now', ?)`,
      `-${days} days`,
    );
  }
}
