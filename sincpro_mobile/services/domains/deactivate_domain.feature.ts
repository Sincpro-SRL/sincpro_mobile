import { Command } from "@sincpro/client-framework";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

export class CommandDeactivateDomain extends Command<void> {
  constructor(readonly domain: string) {
    super();
  }
}

/** Turns a module's domain off; a shared one stays on. */
@commonBoundedContext.feature(CommandDeactivateDomain)
export class DeactivateDomain extends Feature<CommandDeactivateDomain, void> {
  async execute(command: CommandDeactivateDomain): Promise<void> {
    await this.domains.disableDomain(command.domain);
  }
}
