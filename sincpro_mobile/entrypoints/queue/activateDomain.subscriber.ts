import {
  ActivateDomainEvent,
  DeactivateDomainEvent,
  DomainEvent,
} from "@sincpro/mobile/domain/event";
import { Subscriber } from "@sincpro/mobile/domain/subscriber";
import { orchestrator } from "@sincpro/mobile/entrypoints/app/orchestrator";

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
