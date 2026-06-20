import { SettingsRepository } from "../../adapters/repositories/setting.repository";
import { DomainEvent } from "../../domain/event";
import { NewAppSettingsEvent } from "../../domain/settings";
import { Subscriber } from "../../domain/subscriber";
import { loggerUseCases } from "../../infrastructure/logger";

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
