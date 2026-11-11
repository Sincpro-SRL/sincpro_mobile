import { logger, newEntityId } from "@sincpro/client-framework";
import { eventStore } from "@sincpro/mobile/adapters/repositories/sqlite_event_store";
import type { EventRecord } from "@sincpro/mobile/domain/events";
import { replaceable } from "@sincpro/mobile/framework/replaceable";
import { eventDelivery } from "@sincpro/mobile/infrastructure/events/delivery";

/** The events screen shows the latest window; older history stays in SQLite. */
export const RECENT_EVENTS_LIMIT = 500;
export const DEFAULT_EVENT_RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What the screens do with the stored events: read the history, read and retry the failed ones
 * (`set_aside`), delete them, prune what was delivered long ago.
 */
export class EventService {
  async listRecentEvents(limit: number = RECENT_EVENTS_LIMIT): Promise<EventRecord[]> {
    return eventStore.recent(limit);
  }

  /** The failed ones: set aside by the queue, waiting for a person. */
  async listFailedEvents(): Promise<EventRecord[]> {
    return eventStore.inState("set_aside");
  }

  /**
   * Sends failed events back to the queue, once per failure — a second retry of the same one
   * finds nothing —, and delivers what waits. Answers how many went back.
   */
  async retryEvents(records: readonly EventRecord[]): Promise<number> {
    const moved = await eventStore.retry(records.map((record) => record.id));
    logger.info("Failed events sent back to the queue", { count: moved });
    if (moved > 0) void eventDelivery.drain();
    return moved;
  }

  /**
   * Sends one message again: a failed one goes back to wait (`retryEvents`); any other is
   * published anew — a new message with the same name and values, in the same flow, caused by
   * the first one.
   */
  async resendEvent(record: EventRecord): Promise<void> {
    if (record.state === "set_aside") {
      await this.retryEvents([record]);
      return;
    }
    await eventStore.add({
      envelope: {
        name: record.name,
        id: newEntityId(),
        correlationId: record.correlationId,
        causationId: record.id,
        publishedAt: new Date().toISOString(),
      },
      payload: record.payload,
      state: "pending",
      attempts: 0,
      retryAt: null,
      reached: [],
      failures: [],
    });
    void eventDelivery.drain();
  }

  /** Deletes events for good: what they would have done never happens. */
  async deleteEvents(records: readonly EventRecord[]): Promise<void> {
    await eventStore.remove(records.map((record) => record.id));
    logger.info("Stored events deleted", { count: records.length });
  }

  /** Drops delivered events older than the retention window. */
  async pruneHistory(retentionDays: number = DEFAULT_EVENT_RETENTION_DAYS): Promise<void> {
    const cutoff = new Date(Date.now() - retentionDays * DAY_MS).toISOString();
    await eventStore.pruneDeliveredBefore(cutoff);
    logger.info("Delivered events pruned", { before: cutoff });
  }
}

const eventServiceSlot = replaceable(new EventService());

/** Swaps the implementation for a subclass, for the whole app and the core. */
export function setEventService(service: EventService): void {
  eventServiceSlot.set(service);
}

export const eventService: EventService = eventServiceSlot.instance;
