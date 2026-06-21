import { DomainEvent, Subscriber } from "@sincpro/mobile/domain/event_sourcing";
import { ActivateDomainEvent, DeactivateDomainEvent } from "@sincpro/mobile/domain/events";
import { orchestrator } from "@sincpro/mobile/framework/orchestrator";

export class ActivateDomainSubscriber extends Subscriber {
  public readonly requiresAuth = false;
  listen = [ActivateDomainEvent, DeactivateDomainEvent];

  async process(event: DomainEvent): Promise<void> {
    if (event.name === ActivateDomainEvent.name) {
      await orchestrator.enableDomain((event as ActivateDomainEvent).domain);
    } else if (event.name === DeactivateDomainEvent.name) {
      await orchestrator.disableDomain((event as DeactivateDomainEvent).domain);
    }
  }
}
