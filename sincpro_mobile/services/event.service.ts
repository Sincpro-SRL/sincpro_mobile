import { logger } from "@sincpro/client-framework";
import { DomainEventRepository } from "@sincpro/mobile/adapters/repositories/domain_event.repository";
import type { IntegrationEvent } from "@sincpro/mobile/domain/events";
import { replaceable } from "@sincpro/mobile/framework/replaceable";
import { EventBus } from "@sincpro/mobile/infrastructure/workers/EventBus";

/** The events screen shows the latest window; older history stays in SQLite. */
export const RECENT_EVENTS_LIMIT = 500;
export const DEFAULT_EVENT_RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export class EventService {
  async listRecentEvents(limit: number = RECENT_EVENTS_LIMIT): Promise<IntegrationEvent[]> {
    logger.info(`Fetching the latest ${limit} events`);
    return DomainEventRepository.findRecent(limit);
  }

  /** Drops acknowledged events older than the retention window. */
  async pruneHistory(retentionDays: number = DEFAULT_EVENT_RETENTION_DAYS): Promise<void> {
    const cutoff = new Date(Date.now() - retentionDays * DAY_MS).toISOString();
    await DomainEventRepository.removeAcknowledgedBefore(cutoff);
    logger.info(`Pruned acknowledged events before ${cutoff}`);
  }

  async republishSync(event: IntegrationEvent): Promise<void> {
    const cloned = event.cloneWithReset();
    logger.info(`Republishing event sync: ${cloned.name} (${cloned.uuid})`);
    await EventBus.publishSync(cloned);
  }
}

const eventServiceSlot = replaceable(new EventService());

/** Swaps the implementation for a subclass, for the whole app and the core. */
export function setEventService(service: EventService): void {
  eventServiceSlot.set(service);
}

export const eventService: EventService = eventServiceSlot.instance;
