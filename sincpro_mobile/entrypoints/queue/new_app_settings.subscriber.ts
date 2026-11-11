import { type BoundedContext, EventSubscriber } from "@sincpro/client-framework";
import { NewAppSettingsEvent } from "@sincpro/mobile/domain/events";
import type { CommonDependencies } from "@sincpro/mobile/infrastructure/bounded_context";
import { CommandApplyAppSettings } from "@sincpro/mobile/services/settings/apply_app_settings.feature";

export class NewAppSettingsSubscriber extends EventSubscriber<NewAppSettingsEvent> {
  static readonly subscriberName = "NewAppSettings";
  declare readonly commonBoundedContext: BoundedContext<CommonDependencies>;

  async handle(event: NewAppSettingsEvent): Promise<void> {
    await this.commonBoundedContext.execute(new CommandApplyAppSettings(event.settings));
  }
}
