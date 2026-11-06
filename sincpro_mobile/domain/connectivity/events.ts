import { DomainEvent } from "@sincpro/mobile/domain/events/domain_event";

export class InternetIsDownEvent extends DomainEvent {
  static readonly name = "common.network.down";
  static readonly label = "Internet desconectado";
  static readonly requiresNetwork = false;

  readonly name = InternetIsDownEvent.name;
  readonly label = InternetIsDownEvent.label;
  readonly requiresNetwork = InternetIsDownEvent.requiresNetwork;
}

export class InternetIsUpEvent extends DomainEvent {
  static readonly name = "common.network.up";
  static readonly label = "Internet conectado";
  static readonly requiresNetwork = true;

  readonly name = InternetIsUpEvent.name;
  readonly label = InternetIsUpEvent.label;
  readonly requiresNetwork = InternetIsUpEvent.requiresNetwork;
}
