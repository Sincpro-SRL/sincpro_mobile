import { DomainEvent } from "@sincpro/mobile/domain/event_sourcing/domain_event";
import { ISetting } from "@sincpro/mobile/domain/settings";

export * from "@sincpro/mobile/domain/connectivity/events";
export * from "@sincpro/mobile/domain/event_sourcing/event";
export * from "@sincpro/mobile/domain/print/events";
export * from "@sincpro/mobile/domain/webview/events";

export class ActivateDomainEvent extends DomainEvent {
  static readonly name = "common.domain.v2.activate";
  static readonly label = "Activar dominio";
  static readonly requiresNetwork = false;

  readonly name = ActivateDomainEvent.name;
  readonly label = ActivateDomainEvent.label;
  readonly requiresNetwork = ActivateDomainEvent.requiresNetwork;

  domain: string = "";
}

export class DeactivateDomainEvent extends DomainEvent {
  static readonly name = "common.domain.v2.deactivate";
  static readonly label = "Desactivar dominio";
  static readonly requiresNetwork = false;

  readonly name = DeactivateDomainEvent.name;
  readonly label = DeactivateDomainEvent.label;
  readonly requiresNetwork = DeactivateDomainEvent.requiresNetwork;

  domain: string = "";
}

export class NewAppSettingsEvent extends DomainEvent {
  static readonly name = "common.settings.v2.added_new_settings";
  static readonly label = "Nuevas configuraciones";
  static readonly requiresNetwork = false;

  public readonly name = NewAppSettingsEvent.name;
  public readonly label = NewAppSettingsEvent.label;
  public readonly requiresNetwork = NewAppSettingsEvent.requiresNetwork;

  public settings: ISetting[] = [];
}
