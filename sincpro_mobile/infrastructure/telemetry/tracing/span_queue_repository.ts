import type { DBCursor } from "@sincpro/mobile/infrastructure/database";

import type { BufferStats } from "../types.ts";
import type { SpanSampler } from "./span_sampler.ts";

export interface SpanRow {
  id: number;
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  kind: number;
  start_time_unixnano: string;
  end_time_unixnano: string;
  attributes: string;
  status_code: number;
  status_message: string;
  resource_attrs: string;
  /** JSON array of {name, timeUnixNano, attributes} — from span.recordException() etc. */
  events: string;
  /** JSON array of {traceId, spanId, attributes} — cross-service links. */
  links: string;
  created_at: string;
}

export type SpanInput = Omit<SpanRow, "id" | "created_at">;

/** Max rows kept in spans_queue before eviction kicks in. */
export const MAX_SPANS_QUEUE_SIZE = 5_000;
/** Max approximate payload bytes kept in spans_queue (~6 MB). */
export const MAX_SPANS_QUEUE_BYTES = 6_000_000;
/** Run the (scanning) eviction check once every N enqueues — see class doc. */
export const EVICT_CHECK_EVERY = 32;
/** Fraction of either budget above which head sampling activates. */
export const PRESSURE_FRACTION = 0.8;

/**
 * Offline-first span buffer with **trace-coherent** eviction.
 *
 * Spans are bounded by BOTH a row count and a payload-byte budget. When either
 * is exceeded the OLDEST WHOLE TRACE is dropped — never individual spans —
 * so survivors are always complete, usable traces. Dropping spans by row (FIFO)
 * would evict root/parent spans first and leave orphaned children that render
 * as broken traces downstream.
 *
 * The budget check scans the table (COUNT + SUM of lengths), so it runs
 * **amortized** — once every `evictEvery` enqueues — to keep the hot path cheap
 * under offline bursts. The bound is therefore soft: the queue may transiently
 * exceed the cap by up to `evictEvery` rows before the next trim.
 *
 * When a {@link SpanSampler} is supplied, head sampling kicks in once the buffer
 * passes {@link PRESSURE_FRACTION} of either budget: whole traces are dropped at
 * ingest (coherently) so the buffer stops thrashing instead of inserting spans
 * it would immediately evict. Pressure is read from the last amortized
 * measurement — no extra scan on the hot path.
 *
 * Telemetry is best-effort: under sustained offline pressure data IS dropped,
 * but coherently and visibly (see {@link stats}).
 */
export class SpanQueueRepository {
  private readonly db: typeof DBCursor;
  private readonly maxRows: number;
  private readonly maxBytes: number;
  private readonly evictEvery: number;
  private readonly sampler: SpanSampler | null;
  private ops = 0;
  private dropped = 0;
  private sampledOut = 0;
  // Last measured size — drives the cheap pressure check on the hot path.
  private lastRows = 0;
  private lastBytes = 0;
  // Whether the buffer size has been measured at least once (cold-start guard).
  private measuredOnce = false;

  constructor(
    db: typeof DBCursor,
    maxRows = MAX_SPANS_QUEUE_SIZE,
    maxBytes = MAX_SPANS_QUEUE_BYTES,
    evictEvery = EVICT_CHECK_EVERY,
    sampler: SpanSampler | null = null,
  ) {
    this.db = db;
    this.maxRows = maxRows;
    this.maxBytes = maxBytes;
    this.evictEvery = Math.max(1, evictEvery);
    this.sampler = sampler;
  }

  async enqueue(span: SpanInput): Promise<void> {
    // Head sampling — drop whole traces at ingest while under pressure, so we
    // don't insert spans only to evict them moments later. Coherent per trace.
    if (this.sampler) {
      // Cold-start guard: measure once before the first sampling decision so a
      // buffer that booted already-full (SQLite persists) is seen as pressured.
      if (!this.measuredOnce) await this.measure();
      if (!this.sampler.shouldKeep(span.trace_id, this.underPressure())) {
        this.sampledOut += 1;
        return;
      }
    }

    await this.db.mutateDatabase(
      `INSERT INTO spans_queue
        (trace_id, span_id, parent_span_id, name, kind,
         start_time_unixnano, end_time_unixnano,
         attributes, status_code, status_message, resource_attrs,
         events, links)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      span.trace_id,
      span.span_id,
      span.parent_span_id,
      span.name,
      span.kind,
      span.start_time_unixnano,
      span.end_time_unixnano,
      span.attributes,
      span.status_code,
      span.status_message,
      span.resource_attrs,
      span.events,
      span.links,
    );

    if (++this.ops >= this.evictEvery) {
      this.ops = 0;
      await this.evict();
    }
  }

  /** Cheap pressure check from the last amortized measurement (no scan). */
  private underPressure(): boolean {
    return (
      this.lastRows >= this.maxRows * PRESSURE_FRACTION ||
      this.lastBytes >= this.maxBytes * PRESSURE_FRACTION
    );
  }

  /**
   * Drops the oldest whole traces until both row and byte budgets are met.
   * Terminates: each pass either returns (under budget / empty) or removes ≥1
   * row, and the row count strictly decreases.
   */
  private async evict(): Promise<void> {
    for (;;) {
      const { rows, approxBytes } = await this.measure();
      if (rows <= this.maxRows && approxBytes <= this.maxBytes) return;

      const res = await this.db.mutateDatabase(
        `DELETE FROM spans_queue WHERE trace_id = (
           SELECT trace_id FROM spans_queue GROUP BY trace_id ORDER BY MIN(id) ASC LIMIT 1
         )`,
      );
      const removed = (res as { changes?: number } | undefined)?.changes ?? 0;
      if (removed === 0) return; // queue empty — nothing left to evict
      this.dropped += removed;
    }
  }

  private async measure(): Promise<{ rows: number; approxBytes: number }> {
    const row = await this.db.getFirstAsync<{ rows: number; bytes: number }>(
      `SELECT COUNT(*) AS rows,
        COALESCE(SUM(
          length(trace_id) + length(span_id) + length(COALESCE(parent_span_id, ''))
          + length(name) + length(start_time_unixnano) + length(end_time_unixnano)
          + length(attributes) + length(status_message) + length(resource_attrs)
          + length(events) + length(links)
        ), 0) AS bytes
       FROM spans_queue`,
    );
    const rows = row?.rows ?? 0;
    const approxBytes = row?.bytes ?? 0;
    // Cache for the hot-path pressure check.
    this.lastRows = rows;
    this.lastBytes = approxBytes;
    this.measuredOnce = true;
    return { rows, approxBytes };
  }

  async stats(): Promise<BufferStats> {
    const { rows, approxBytes } = await this.measure();
    return { rows, approxBytes, dropped: this.dropped, sampled: this.sampledOut };
  }

  async findPending(limit = 100): Promise<SpanRow[]> {
    return this.db.getAllAsync<SpanRow>(
      `SELECT * FROM spans_queue ORDER BY id ASC LIMIT ?`,
      limit,
    );
  }

  async removeMany(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => "?").join(", ");
    await this.db.mutateDatabase(
      `DELETE FROM spans_queue WHERE id IN (${placeholders})`,
      ...ids,
    );
  }

  async pruneExpired(days = 7): Promise<void> {
    await this.db.mutateDatabase(
      `DELETE FROM spans_queue WHERE created_at < datetime('now', ?)`,
      `-${days} days`,
    );
  }
}
