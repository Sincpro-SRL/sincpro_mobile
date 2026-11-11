/**
 * What the stored events' use cases share: their defaults. What a use case does with the event
 * store and the queue is written in the use case.
 */

/** The events screen shows the latest window; older history stays in SQLite. */
export const RECENT_EVENTS_LIMIT = 500;

/** Days a delivered event stays in the history. */
export const DEFAULT_EVENT_RETENTION_DAYS = 7;
