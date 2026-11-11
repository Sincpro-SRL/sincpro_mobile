import { DomainEvent } from "@sincpro/client-framework";
import { ISetting } from "@sincpro/mobile/domain/settings";

export class ActivateDomainEvent extends DomainEvent {
  static readonly eventName = "common.domain.activate";
  static readonly label = "Activar dominio";
  static readonly requiresSession = false;

  domain: string = "";
}

export class DeactivateDomainEvent extends DomainEvent {
  static readonly eventName = "common.domain.deactivate";
  static readonly label = "Desactivar dominio";
  static readonly requiresSession = false;

  domain: string = "";
}

export class NewAppSettingsEvent extends DomainEvent {
  static readonly eventName = "common.settings.added";
  static readonly label = "Nuevas configuraciones";

  settings: ISetting[] = [];
}
