import { Command, Feature } from "@sincpro/client-framework";

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

/** Turns a module's domain on: its subscriptions hear, its crons run. */
export class ActivateDomain extends Feature<CommandActivateDomain, void> {
  static readonly serviceName = "ActivateDomain";
  declare readonly domains: DomainSwitch;

  async execute(command: CommandActivateDomain): Promise<void> {
    await this.domains.enableDomain(command.domain);
  }
}

/** Turns a module's domain off; a shared one stays on. */
export class DeactivateDomain extends Feature<CommandDeactivateDomain, void> {
  static readonly serviceName = "DeactivateDomain";
  declare readonly domains: DomainSwitch;

  async execute(command: CommandDeactivateDomain): Promise<void> {
    await this.domains.disableDomain(command.domain);
  }
}
