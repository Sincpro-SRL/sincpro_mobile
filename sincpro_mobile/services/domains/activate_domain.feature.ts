import { Command } from "@sincpro/client-framework";
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

/** Turns a module's domain on: its bounded contexts hear, its crons run. */
@commonBoundedContext.feature(CommandActivateDomain)
export class ActivateDomain extends Feature<CommandActivateDomain, void> {
  async execute(command: CommandActivateDomain): Promise<void> {
    await this.domains.enableDomain(command.domain);
  }
}

/** Turns a module's domain off; a shared one stays on. */
@commonBoundedContext.feature(CommandDeactivateDomain)
export class DeactivateDomain extends Feature<CommandDeactivateDomain, void> {
  async execute(command: CommandDeactivateDomain): Promise<void> {
    await this.domains.disableDomain(command.domain);
  }
}
