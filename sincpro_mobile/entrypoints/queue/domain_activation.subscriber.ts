import { type BoundedContext, EventSubscriber } from "@sincpro/client-framework";
import { ActivateDomainEvent, DeactivateDomainEvent } from "@sincpro/mobile/domain/events";
import type { CommonDependencies } from "@sincpro/mobile/infrastructure/bounded_context";
import {
  CommandActivateDomain,
  CommandDeactivateDomain,
} from "@sincpro/mobile/services/domains/activate_domain.feature";

export class DomainActivatedSubscriber extends EventSubscriber<ActivateDomainEvent> {
  static readonly subscriberName = "DomainActivated";
  declare readonly commonBoundedContext: BoundedContext<CommonDependencies>;

  async handle(event: ActivateDomainEvent): Promise<void> {
    await this.commonBoundedContext.execute(new CommandActivateDomain(event.domain));
  }
}

export class DomainDeactivatedSubscriber extends EventSubscriber<DeactivateDomainEvent> {
  static readonly subscriberName = "DomainDeactivated";
  declare readonly commonBoundedContext: BoundedContext<CommonDependencies>;

  async handle(event: DeactivateDomainEvent): Promise<void> {
    await this.commonBoundedContext.execute(new CommandDeactivateDomain(event.domain));
  }
}
