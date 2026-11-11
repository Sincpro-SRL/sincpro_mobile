/** How long a page's capture may take before its print is given up. */
export const PRINT_CAPTURE_TIMEOUT_MS = 45_000;

/**
 * The page captures that started and have not answered yet — an image or a failure. One that
 * never answers ends as a failure instead of a notice that spins forever.
 *
 * Context: it lives in the process, not in a use case: a service is a singleton of its
 * generation, and a timer is no part of a run. What happens on time out is the caller's — the
 * print cycle executes `CommandFailPagePrint`.
 */
export class PagePrintWatch {
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly timeoutMs: number = PRINT_CAPTURE_TIMEOUT_MS) {}

  /** Watches `jobId`; a job started again restarts its time. */
  start(jobId: string, onTimeout: () => void): void {
    this.settle(jobId);
    this.pending.set(
      jobId,
      setTimeout(() => {
        this.pending.delete(jobId);
        onTimeout();
      }, this.timeoutMs),
    );
  }

  /** The job answered: nothing happens on time out. */
  settle(jobId: string): void {
    const timer = this.pending.get(jobId);
    if (timer !== undefined) clearTimeout(timer);
    this.pending.delete(jobId);
  }

  isWatching(jobId: string): boolean {
    return this.pending.has(jobId);
  }
}
