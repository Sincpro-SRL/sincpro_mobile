import { Command } from "@sincpro/client-framework";
import type { ISetting } from "@sincpro/mobile/domain/settings";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

/** Where settings are kept. */
export type SettingsStore = { saveOneSetting(name: string, value: unknown): Promise<void> };

export class CommandApplyAppSettings extends Command<number> {
  constructor(readonly settings: readonly ISetting[]) {
    super();
  }
}

/** Keeps the settings an app received; answers how many. */
@commonBoundedContext.feature(CommandApplyAppSettings)
export class ApplyAppSettings extends Feature<CommandApplyAppSettings, number> {
  async execute(command: CommandApplyAppSettings): Promise<number> {
    for (const setting of command.settings) {
      await this.settingsStore.saveOneSetting(setting.key, setting.value);
    }
    this.logger.info("Settings saved", { count: command.settings.length });
    return command.settings.length;
  }
}
