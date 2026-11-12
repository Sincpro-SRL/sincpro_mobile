import { DomainEvent } from "@sincpro/client-framework";
import { ISetting } from "@sincpro/mobile/domain/settings";

export class NewAppSettingsEvent extends DomainEvent {
  static readonly eventName = "common.settings.added";
  static readonly label = "Nuevas configuraciones";

  settings: ISetting[] = [];
}
