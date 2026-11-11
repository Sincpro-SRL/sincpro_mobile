import { DomainEvent } from "@sincpro/client-framework";

/** The connection went away: told to the screens and the delivery (`UIEventBus`), never queued. */
export class InternetIsDownEvent extends DomainEvent {
  static readonly eventName = "common.network.down";
  static readonly label = "Internet desconectado";
}

/** The connection came back: what waits for the network may be delivered. */
export class InternetIsUpEvent extends DomainEvent {
  static readonly eventName = "common.network.up";
  static readonly label = "Internet conectado";
}
