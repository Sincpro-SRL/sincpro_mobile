import type { ConnectivityState } from "./connectivity_state.ts";
import type { FlushClient, FlushQueue, LogFlushJobState } from "./logging/flush_job.ts";
import { createLogFlushJobState, runLogFlushJob } from "./logging/flush_job.ts";
import type {
  SpanFlushClient,
  SpanFlushJobState,
  SpanFlushQueue,
} from "./tracing/span_flush_job.ts";
import { createSpanFlushJobState, runSpanFlushJob } from "./tracing/span_flush_job.ts";

export interface FlushTelemetryDeps {
  connectivity: ConnectivityState;
  logClient?: FlushClient | null;
  logQueue?: FlushQueue | null;
  spanClient?: SpanFlushClient | null;
  spanQueue?: SpanFlushQueue | null;
}

/**
 * The single unit of telemetry delivery. Every trigger — production signal,
 * reconnect event, background cron — funnels through `run()`, which drains BOTH
 * the log and span queues.
 *
 * Throttling and offline recovery are delegated to the jobs' own exponential
 * backoff: after a failed delivery a job skips a growing number of runs, then
 * retries. There is NO sticky offline gate, so the pipeline always recovers
 * once the network returns — even with no cron and no connectivity events. The
 * HTTP send timeout prevents a flush from hanging while offline.
 *
 * `ConnectivityState` is kept informational (surfaced in stats, fed by events);
 * it never blocks delivery.
 */
export class FlushTelemetry {
  private readonly deps: FlushTelemetryDeps;
  private logState: LogFlushJobState = createLogFlushJobState();
  private spanState: SpanFlushJobState = createSpanFlushJobState();
  private running = false;
  private pending = false;

  constructor(deps: FlushTelemetryDeps) {
    this.deps = deps;
  }

  /**
   * @param resetBackoff - clear the jobs' backoff and retry immediately. Used by
   *   the reconnect event and the background cron so recovery is instant instead
   *   of waiting for the current backoff window to elapse.
   */
  async run({ resetBackoff = false }: { resetBackoff?: boolean } = {}): Promise<void> {
    // Re-entrancy guard. A trigger arriving mid-flush sets `pending` so the
    // current run loops once more — no produced telemetry is silently dropped.
    if (this.running) {
      this.pending = true;
      return;
    }

    this.running = true;
    try {
      let reset = resetBackoff;
      do {
        this.pending = false;

        if (reset) {
          this.logState = createLogFlushJobState();
          this.spanState = createSpanFlushJobState();
          reset = false;
        }

        let delivered = false;
        let failed = false;

        if (this.deps.logClient && this.deps.logQueue) {
          const r = await runLogFlushJob(
            this.deps.logClient,
            this.deps.logQueue,
            this.logState,
          );
          delivered ||= r.delivered > 0;
          failed ||= r.failed;
        }

        if (this.deps.spanClient && this.deps.spanQueue) {
          const r = await runSpanFlushJob(
            this.deps.spanClient,
            this.deps.spanQueue,
            this.spanState,
          );
          delivered ||= r.delivered > 0;
          failed ||= r.failed;
        }

        // A working destination means we are online; only a total failure
        // (nothing delivered) flips the informational flag offline.
        if (delivered) this.deps.connectivity.markOnline();
        else if (failed) this.deps.connectivity.markOffline();
      } while (this.pending);
    } finally {
      this.running = false;
    }
  }
}
