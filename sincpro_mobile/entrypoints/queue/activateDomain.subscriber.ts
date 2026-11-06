import {
  ActivateDomainEvent,
  DeactivateDomainEvent,
  DomainEvent,
} from "@sincpro/mobile/domain/events";
import { Subscriber } from "@sincpro/mobile/event_driven";
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
