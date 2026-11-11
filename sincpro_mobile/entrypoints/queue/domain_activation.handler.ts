import {
  ActivateDomainEvent,
  DeactivateDomainEvent,
} from "@sincpro/mobile/domain/events/catalog";
import { commonBoundedContext, EventHandler } from "@sincpro/mobile/infrastructure/framework";
import {
  CommandActivateDomain,
  CommandDeactivateDomain,
} from "@sincpro/mobile/services/domains/activate_domain.feature";

/** A domain turned on or off by an event: it executes the use case that does it. */
@commonBoundedContext.handler([ActivateDomainEvent, DeactivateDomainEvent])
export class OnDomainSwitched extends EventHandler<
  ActivateDomainEvent | DeactivateDomainEvent
> {
  async handle(event: ActivateDomainEvent | DeactivateDomainEvent): Promise<void> {
    await this.boundedContext.execute(
      event instanceof ActivateDomainEvent
        ? new CommandActivateDomain(event.domain)
        : new CommandDeactivateDomain(event.domain),
    );
  }
}
