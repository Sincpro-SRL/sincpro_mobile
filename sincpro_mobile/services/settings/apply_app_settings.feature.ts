import { Command } from "@sincpro/client-framework";
import { NewAppSettingsEvent } from "@sincpro/mobile/domain/events/catalog";
import type { ISetting } from "@sincpro/mobile/domain/settings";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

/** Where settings are kept. */
export type SettingsStore = { saveOneSetting(name: string, value: unknown): Promise<void> };

export class CommandApplyAppSettings extends Command<number> {
  constructor(readonly settings: readonly ISetting[]) {
    super();
  }
}

/** Keeps the settings an app received — from a screen or the event —; answers how many. */
@commonBoundedContext.feature([CommandApplyAppSettings, NewAppSettingsEvent])
export class ApplyAppSettings extends Feature<
  CommandApplyAppSettings | NewAppSettingsEvent,
  number
> {
  async execute(request: CommandApplyAppSettings | NewAppSettingsEvent): Promise<number> {
    for (const setting of request.settings) {
      await this.settingsStore.saveOneSetting(setting.key, setting.value);
    }
    this.logger.info("Settings saved", { count: request.settings.length });
    return request.settings.length;
  }
}
