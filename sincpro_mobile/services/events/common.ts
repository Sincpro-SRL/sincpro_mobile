import type { Retention } from "@sincpro/mobile/domain/events";

/**
 * What the stored events' use cases share: their defaults. What a use case does with the event
 * store and the queue is written in the use case.
 */

/** The events screen shows the latest window; older history stays in SQLite. */
export const RECENT_EVENTS_LIMIT = 500;

/** How long a stored message is kept, by how it ended: delivered 7 days, failed until a person acts. */
export const DEFAULT_RETENTION: {
  readonly delivered: Retention;
  readonly failed: Retention;
} = { delivered: 7, failed: "forever" };
