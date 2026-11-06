import { IntegrationEvent } from "@sincpro/mobile/domain/events/integration_event";
import { ISetting } from "@sincpro/mobile/domain/settings";

export class ActivateDomainEvent extends IntegrationEvent {
  static readonly name = "common.domain.activate";
  static readonly label = "Activar dominio";
  static readonly requiresNetwork = false;

  readonly name = ActivateDomainEvent.name;
  readonly label = ActivateDomainEvent.label;
  readonly requiresNetwork = ActivateDomainEvent.requiresNetwork;

  domain: string = "";
}

export class DeactivateDomainEvent extends IntegrationEvent {
  static readonly name = "common.domain.deactivate";
  static readonly label = "Desactivar dominio";
  static readonly requiresNetwork = false;

  readonly name = DeactivateDomainEvent.name;
  readonly label = DeactivateDomainEvent.label;
  readonly requiresNetwork = DeactivateDomainEvent.requiresNetwork;

  domain: string = "";
}

export class NewAppSettingsEvent extends IntegrationEvent {
  static readonly name = "common.settings.added";
  static readonly label = "Nuevas configuraciones";
  static readonly requiresNetwork = false;

  public readonly name = NewAppSettingsEvent.name;
  public readonly label = NewAppSettingsEvent.label;
  public readonly requiresNetwork = NewAppSettingsEvent.requiresNetwork;

  public settings: ISetting[] = [];
}
