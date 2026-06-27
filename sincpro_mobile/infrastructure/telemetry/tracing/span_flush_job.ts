import type { FlushResult } from "../logging/flush_job";
import type { SpanRow } from "./span_queue_repository";

export const SPAN_FLUSH_BATCH_SIZE = 100;
export const SPAN_MAX_BATCHES_PER_TICK = 5;
const MAX_SKIP_TICKS = 32;

export interface SpanFlushJobState {
  consecutiveFailures: number;
  skipTicksRemaining: number;
}

export function createSpanFlushJobState(): SpanFlushJobState {
  return { consecutiveFailures: 0, skipTicksRemaining: 0 };
}

export interface SpanFlushClient {
  deliver(spans: SpanRow[]): Promise<void>;
}

export interface SpanFlushQueue {
  pruneExpired(): Promise<void>;
  findPending(limit: number): Promise<SpanRow[]>;
  removeMany(ids: number[]): Promise<void>;
}

/**
 * One tick of the span flush cron.
 *
 * Mirrors runLogFlushJob (logs) — same at-least-once guarantee:
 * deliver() always precedes removeMany(). A span delivered twice to the
 * collector is preferable to a span never delivered.
 */
export async function runSpanFlushJob(
  client: SpanFlushClient,
  queue: SpanFlushQueue,
  state: SpanFlushJobState,
): Promise<FlushResult> {
  if (state.skipTicksRemaining > 0) {
    state.skipTicksRemaining -= 1;
    return { delivered: 0, failed: false };
  }

  await queue.pruneExpired();

  let batchesDelivered = 0;

  while (batchesDelivered < SPAN_MAX_BATCHES_PER_TICK) {
    const spans = await queue.findPending(SPAN_FLUSH_BATCH_SIZE);
    if (spans.length === 0) break;

    try {
      await client.deliver(spans);
    } catch {
      state.consecutiveFailures += 1;
      state.skipTicksRemaining = Math.min(
        Math.pow(2, state.consecutiveFailures - 1),
        MAX_SKIP_TICKS,
      );
      return { delivered: batchesDelivered, failed: true };
    }

    await queue.removeMany(spans.map((s) => s.id));
    batchesDelivered += 1;

    if (spans.length < SPAN_FLUSH_BATCH_SIZE) break;
  }

  if (batchesDelivered > 0) {
    state.consecutiveFailures = 0;
  }

  return { delivered: batchesDelivered, failed: false };
}
