/**
 * Search Tools: concurrency helpers for use-case level search orchestration.
 *
 * Exposes LatestDebounced to coordinate frequent, user-driven async searches
 * while avoiding race conditions and backend hammering.
 */

/**
 * LatestDebounced
 *
 * What it solves (use case):
 * - In interactive UIs (search bars, live filters) users type quickly.
 * - Each key stroke can trigger an async search/use case request.
 * - Without control, multiple in-flight requests compete and late responses can override newer results (race conditions), while also hammering the backend.
 *
 * Core idea:
 * - Allow scheduling tasks frequently, but only execute the latest one and enforce a minimal time gap between executions (debounce at the use-case layer).
 * - If an older scheduled task finishes after a newer one, its result is considered stale and can be replaced by a fallback (e.g., re-read latest local results) via the optional onStale handler.
 *
 * Why use this instead of UI-level debounce?
 * - Keeps UI dead-simple and pushes orchestration to application logic (use cases), matching Clean Architecture.
 * - Centralizes race-condition handling; UI doesn't need abort controllers or timers.
 *
 * Typical usage:
 *   const gate = new LatestDebounced(1000); // 1s min interval
 *   return gate.run(async () => doSearch(query), async () => getLatestLocal(query));
 */
export class LatestDebounced {
  private token = 0;
  private lastAt = 0;

  constructor(private readonly minIntervalMs: number = 800) {}

  /**
   * Runs the provided async task ensuring:
   * - A minimum interval between consecutive executions is respected.
   * - Only the latest scheduled call's result is returned; previous ones are treated as stale.
   * If a stale task completes, onStale (if provided) is invoked to produce a safe value.
   */
  async run<T>(task: () => Promise<T>, onStale?: () => Promise<T>): Promise<T> {
    const current = ++this.token;
    const now = Date.now();
    const elapsed = now - this.lastAt;
    if (elapsed < this.minIntervalMs) {
      await new Promise((r) => setTimeout(r, this.minIntervalMs - elapsed));
    }
    this.lastAt = Date.now();

    const result = await task();
    if (current !== this.token) {
      if (onStale) {
        return onStale();
      }
    }
    return result;
  }
}
