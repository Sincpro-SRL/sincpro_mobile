import {
  InternetIsDownEvent,
  InternetIsUpEvent,
} from "@sincpro/mobile/domain/connectivity/events";
import { UIEventBus } from "@sincpro/mobile/infrastructure/ui/UIEventBus";
import { CronWorker } from "@sincpro/mobile/infrastructure/workers/CronWorker";

import type { ConnectivityState } from "./connectivity_state";
import type { FlushTelemetry } from "./flush_telemetry";
import type { TelemetrySignal } from "./telemetry_signal";

/** Default background-flush interval (minutes). ≥15 → real OS background task. */
export const DEFAULT_BACKGROUND_INTERVAL_MIN = 15;

export interface FlushWorkerOptions {
  /** Background cron interval in minutes (≥15 → OS background task). 0 disables it. */
  backgroundIntervalMin?: number;
  /** Subscribe to InternetIsUp/Down events when the host app emits them. */
  onConnectivityEvents?: boolean;
}

/**
 * Orchestrates telemetry delivery from three independent triggers, all funneling
 * into the same {@link FlushTelemetry} use case — none of them required:
 *
 *  1. Production signal (intrinsic, always on): producing telemetry schedules a
 *     debounced flush. This is the primary path and needs no cron or events.
 *  2. Connectivity events (opt-in): if the host app emits InternetIsUp/Down,
 *     reconnecting triggers an immediate backlog drain.
 *  3. Background cron (opt-in): a long-interval OS background task probes and
 *     drains, as a safety net for whatever the other two missed.
 *
 * The framework never *depends* on the connectivity cron or the event bus.
 */
export class TelemetryFlushWorker {
  private readonly flush: FlushTelemetry;
  private readonly signal: TelemetrySignal;
  private readonly connectivity: ConnectivityState;
  private readonly opts: FlushWorkerOptions;
  private cron: CronWorker | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    flush: FlushTelemetry,
    signal: TelemetrySignal,
    connectivity: ConnectivityState,
    opts: FlushWorkerOptions = {},
  ) {
    this.flush = flush;
    this.signal = signal;
    this.connectivity = connectivity;
    this.opts = opts;
  }

  start(): void {
    // Trigger 2 — reconnect events (opt-in). Up → drain now (reset backoff);
    // Down → mark offline (informational; delivery still self-recovers via backoff).
    if (this.opts.onConnectivityEvents) {
      const offUp = UIEventBus.on(InternetIsUpEvent.name, () => {
        this.connectivity.markOnline();
        this.flush.run({ resetBackoff: true }).catch(() => {});
      });
      const offDown = UIEventBus.on(InternetIsDownEvent.name, () => {
        this.connectivity.markOffline();
      });
      this.unsubscribe = () => {
        offUp();
        offDown();
      };
    }

    // Trigger 3 — background safety net (opt-in). Resets backoff so a long
    // offline backlog drains promptly when the OS runs the task.
    const intervalMin = this.opts.backgroundIntervalMin ?? DEFAULT_BACKGROUND_INTERVAL_MIN;
    if (intervalMin > 0) {
      this.cron = new CronWorker(
        "TELEMETRY_FLUSH",
        () => this.flush.run({ resetBackoff: true }),
        intervalMin,
      );
      this.cron.start().catch(() => {});
    }
  }

  async stop(): Promise<void> {
    this.signal.dispose();
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.cron) {
      await this.cron.unregister().catch(() => {});
      this.cron = null;
    }
  }
}
