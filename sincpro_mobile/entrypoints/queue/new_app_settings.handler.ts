import { NewAppSettingsEvent } from "@sincpro/mobile/domain/events/catalog";
import { commonBoundedContext, EventHandler } from "@sincpro/mobile/infrastructure/framework";
import { CommandApplyAppSettings } from "@sincpro/mobile/services/settings/apply_app_settings.feature";

/** Settings an app received by an event: it executes the use case that keeps them. */
@commonBoundedContext.handler([NewAppSettingsEvent])
export class OnNewAppSettings extends EventHandler<NewAppSettingsEvent> {
  async handle(event: NewAppSettingsEvent): Promise<void> {
    await this.boundedContext.execute(new CommandApplyAppSettings(event.settings));
  }
}
