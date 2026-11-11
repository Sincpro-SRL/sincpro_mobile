import type { SqliteEventStore } from "@sincpro/mobile/adapters/repositories/sqlite_event_store";

/** The stored queue as the event use cases need it: deliver what waits. */
export type EventDelivery = { drain(): Promise<void> };

/** The events screen shows the latest window; older history stays in SQLite. */
export const RECENT_EVENTS_LIMIT = 500;
/** Days a delivered event stays in the history. */
export const DEFAULT_EVENT_RETENTION_DAYS = 7;

/**
 * Sends set-aside events back to the queue, once per failure — a second retry of the same one
 * finds nothing —, and delivers what waits. Answers how many went back.
 */
export async function sendBack(
  store: SqliteEventStore,
  delivery: EventDelivery,
  ids: readonly string[],
): Promise<number> {
  const moved = await store.retry(ids);
  if (moved > 0) void delivery.drain();
  return moved;
}
