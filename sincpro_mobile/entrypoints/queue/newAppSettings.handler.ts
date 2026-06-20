import { SettingsRepository } from "@sincpro/mobile/adapters/repositories/setting.repository";
import { DomainEvent } from "@sincpro/mobile/domain/event";
import { NewAppSettingsEvent } from "@sincpro/mobile/domain/settings";
import { Subscriber } from "@sincpro/mobile/domain/subscriber";
import { loggerUseCases } from "@sincpro/mobile/infrastructure/logger";

export class NewAppSettingsSubscriber extends Subscriber {
  listen = [NewAppSettingsEvent];

  getEvent(event: DomainEvent): NewAppSettingsEvent {
    return NewAppSettingsEvent.from(event);
  }

  async process(event: NewAppSettingsEvent): Promise<void> {
    loggerUseCases.info(`Setting ${event.settings.length} settings`);

    for (const setting of event.settings) {
      await SettingsRepository.saveOneSetting(setting.key, setting.value);
    }

    loggerUseCases.info(`${event.settings.length} settings saved successfully`);
  }
}
