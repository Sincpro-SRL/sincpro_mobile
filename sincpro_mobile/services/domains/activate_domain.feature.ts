import { Command } from "@sincpro/client-framework";
import {
  ActivateDomainEvent,
  DeactivateDomainEvent,
} from "@sincpro/mobile/domain/events/catalog";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

/** What turns a module's domain on or off: the orchestrator. */
export type DomainSwitch = {
  enableDomain(key: string): Promise<void>;
  disableDomain(key: string): Promise<void>;
};

export class CommandActivateDomain extends Command<void> {
  constructor(readonly domain: string) {
    super();
  }
}

export class CommandDeactivateDomain extends Command<void> {
  constructor(readonly domain: string) {
    super();
  }
}

/** Turns a module's domain on — its bounded contexts hear, its crons run —; a screen or the event. */
@commonBoundedContext.feature([CommandActivateDomain, ActivateDomainEvent])
export class ActivateDomain extends Feature<
  CommandActivateDomain | ActivateDomainEvent,
  void
> {
  async execute(request: CommandActivateDomain | ActivateDomainEvent): Promise<void> {
    await this.domains.enableDomain(request.domain);
  }
}

/** Turns a module's domain off; a shared one stays on. */
@commonBoundedContext.feature([CommandDeactivateDomain, DeactivateDomainEvent])
export class DeactivateDomain extends Feature<
  CommandDeactivateDomain | DeactivateDomainEvent,
  void
> {
  async execute(request: CommandDeactivateDomain | DeactivateDomainEvent): Promise<void> {
    await this.domains.disableDomain(request.domain);
  }
}
