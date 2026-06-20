import { ActivateDomainEvent, DeactivateDomainEvent, DomainEvent } from "../../domain/event";
import { Subscriber } from "../../domain/subscriber";
import { orchestrator } from "../app/orchestrator";

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
