import { Command } from "@sincpro/client-framework";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

export class CommandActivateDomain extends Command<void> {
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
