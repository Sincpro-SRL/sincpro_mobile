import type { LogQueueRepository } from "./log_queue_repository";

type Shipping = { readonly queue: LogQueueRepository; readonly notify: () => void };

let shipping: Shipping | null = null;

/**
 * Where log lines go once telemetry starts (`initTelemetry`): stored in the log queue, and the
 * flush told — the same debounced signal spans use, so a burst of lines is one request.
 */
export function initLogShipping(queue: LogQueueRepository, notify: () => void): void {
  shipping = { queue, notify };
}

/** Whether lines are shipped: telemetry started with Loki. */
export function shipsLogs(): boolean {
  return shipping !== null;
}

/**
 * Keeps one line to ship, then tells the flush. Never throws and never waits on the network:
 * observability never fails a use case, and an offline phone pays one SQLite insert per line.
 */
export function shipLog(level: string, line: string): void {
  const current = shipping;
  if (!current) return;
  current.queue
    .enqueue(level, line)
    .then(current.notify)
    .catch(() => undefined);
}

/** @internal — test use only */
export function _resetLogShipping(): void {
  shipping = null;
}
