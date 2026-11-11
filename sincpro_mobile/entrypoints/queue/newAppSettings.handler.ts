import { logger } from "@sincpro/client-framework";
import { SettingsRepository } from "@sincpro/mobile/adapters/repositories/setting.repository";
import { DomainEvent, NewAppSettingsEvent } from "@sincpro/mobile/domain/events";
import { Subscriber } from "@sincpro/mobile/event_driven";

export class NewAppSettingsSubscriber extends Subscriber {
  listen = [NewAppSettingsEvent];

  getEvent(event: DomainEvent): NewAppSettingsEvent {
    return NewAppSettingsEvent.from(event);
  }

  async process(event: NewAppSettingsEvent): Promise<void> {
    logger.info(`Setting ${event.settings.length} settings`);

    for (const setting of event.settings) {
      await SettingsRepository.saveOneSetting(setting.key, setting.value);
    }

    logger.info(`${event.settings.length} settings saved successfully`);
  }
}
