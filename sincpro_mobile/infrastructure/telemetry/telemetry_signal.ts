/** Default coalescing window for production-triggered flushes. */
export const DEFAULT_SIGNAL_DEBOUNCE_MS = 3000;

/**
 * In-memory, debounced trigger. Telemetry is produced far faster than it should
 * be shipped, so a burst of `notify()` calls collapses into a single `onFlush`
 * after a quiet window. This is the production trigger — intrinsic to producing
 * telemetry, with no dependency on crons or the event bus.
 */
export class TelemetrySignal {
  private readonly onFlush: () => void;
  private readonly debounceMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(onFlush: () => void, debounceMs = DEFAULT_SIGNAL_DEBOUNCE_MS) {
    this.onFlush = onFlush;
    this.debounceMs = debounceMs;
  }

  /** Schedules a single flush; further calls within the window are coalesced. */
  notify(): void {
    if (this.timer) return; // a flush is already scheduled — coalesce
    this.timer = setTimeout(() => {
      this.timer = null;
      this.onFlush();
    }, this.debounceMs);
  }

  /** Cancels a pending flush (used on teardown / re-init). */
  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
