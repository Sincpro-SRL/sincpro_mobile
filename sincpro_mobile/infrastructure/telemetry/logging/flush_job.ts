import type { LogEntry } from "./log_queue_repository.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max entries per Loki push request. Keeps payloads well under the 4MB Loki limit. */
export const FLUSH_BATCH_SIZE = 100;

/**
 * Max batches drained in a single cron tick.
 * After an offline period the queue can hold thousands of entries; without this cap
 * a single tick could run for minutes blocking the CronWorker job slot.
 * 5 batches × 100 entries = 500 entries max per minute — enough to drain hours of
 * backlog within a few ticks without saturating the cron.
 */
export const MAX_BATCHES_PER_TICK = 5;

/**
 * Exponential backoff cap in ticks. After repeated Loki failures the cron backs off
 * up to 32 skipped ticks (32 min at 1-min interval) before retrying.
 */
const MAX_SKIP_TICKS = 32;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Mutable backoff state — one instance held by FlushTelemetry. */
export interface LogFlushJobState {
  consecutiveFailures: number;
  skipTicksRemaining: number;
}

export function createLogFlushJobState(): LogFlushJobState {
  return { consecutiveFailures: 0, skipTicksRemaining: 0 };
}

/** Outcome of one flush run — lets callers update connectivity state. */
export interface FlushResult {
  /** Batches successfully delivered this run. */
  delivered: number;
  /** True if a delivery failed (network/HTTP) — caller may mark offline. */
  failed: boolean;
}

// ---------------------------------------------------------------------------
// Interfaces — minimal surface so the job stays testable without expo deps
// ---------------------------------------------------------------------------

export interface FlushClient {
  deliver(entries: LogEntry[]): Promise<void>;
}

export interface FlushQueue {
  pruneExpired(): Promise<void>;
  findPending(limit: number): Promise<LogEntry[]>;
  removeMany(ids: number[]): Promise<void>;
}

// ---------------------------------------------------------------------------
// Core flush logic
// ---------------------------------------------------------------------------

/**
 * One tick of the flush cron.
 *
 * Ordering invariant: `deliver()` always runs before `removeMany()`.
 * A crash between the two means the same entries are retried next tick (at-least-once
 * delivery). Duplicates in Loki are acceptable for log telemetry; data loss is not.
 *
 * Transactions: impossible here — an HTTP call sits between the SQLite read and delete.
 * The mutex inside DBCursor serialises concurrent DB access, but two overlapping cron
 * ticks can still deliver the same batch twice. Again: acceptable for logs.
 */
export async function runLogFlushJob(
  client: FlushClient,
  queue: FlushQueue,
  state: LogFlushJobState,
): Promise<FlushResult> {
  // Backoff — skip this tick if previous deliveries failed repeatedly
  if (state.skipTicksRemaining > 0) {
    state.skipTicksRemaining -= 1;
    return { delivered: 0, failed: false };
  }

  await queue.pruneExpired();

  let batchesDelivered = 0;

  while (batchesDelivered < MAX_BATCHES_PER_TICK) {
    const entries = await queue.findPending(FLUSH_BATCH_SIZE);
    if (entries.length === 0) break;

    try {
      await client.deliver(entries);
    } catch {
      // Loki is unavailable — keep entries in queue and back off.
      state.consecutiveFailures += 1;
      // 1st fail → skip 1 tick (retry in 2 min)
      // 2nd fail → skip 2 ticks (retry in 3 min)  …capped at 32
      state.skipTicksRemaining = Math.min(
        Math.pow(2, state.consecutiveFailures - 1),
        MAX_SKIP_TICKS,
      );
      return { delivered: batchesDelivered, failed: true };
    }

    await queue.removeMany(entries.map((e) => e.id));
    batchesDelivered += 1;

    // Fewer entries than the batch limit → queue is now empty
    if (entries.length < FLUSH_BATCH_SIZE) break;
  }

  if (batchesDelivered > 0) {
    state.consecutiveFailures = 0;
  }

  return { delivered: batchesDelivered, failed: false };
}
