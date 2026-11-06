import { DomainEventRepository } from "@sincpro/mobile/adapters/repositories/domain_event.repository";
import { EEventStatus, type IntegrationEvent } from "@sincpro/mobile/domain/event_sourcing";
import { loggerUseCases } from "@sincpro/mobile/infrastructure/logger";
import { EventBus } from "@sincpro/mobile/infrastructure/workers/EventBus";

class EventService {
  async listAllEvents(): Promise<IntegrationEvent[]> {
    loggerUseCases.info("Fetching all events from DomainEvent repository");
    // Ordered by created_at DESC from repository query
    const pending = await DomainEventRepository.findByStatuses([
      EEventStatus.PENDING,
      EEventStatus.PROCESSING,
      EEventStatus.ACKNOWLEDGED,
      EEventStatus.FAILED,
      EEventStatus.CANCELLED,
    ]);
    return pending;
  }

  async republishSync(event: IntegrationEvent): Promise<void> {
    const cloned = event.cloneWithReset();
    loggerUseCases.info(`Republishing event sync: ${cloned.name} (${cloned.uuid})`);
    await EventBus.publishSync(cloned);
  }
}

export const eventService = new EventService();
