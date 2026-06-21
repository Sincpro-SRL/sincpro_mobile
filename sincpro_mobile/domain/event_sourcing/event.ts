import { DomainEvent } from "@sincpro/mobile/domain/event_sourcing/domain_event";

export class QueueStartEvent extends DomainEvent {
  static readonly name = "common.queue_event.v2.start";
  static readonly label = "Iniciando procesamiento de cola";
  static readonly requiresNetwork = false;

  readonly name = QueueStartEvent.name;
  readonly label = QueueStartEvent.label;
  readonly requiresNetwork = QueueStartEvent.requiresNetwork;
}

export class QueueEndEvent extends DomainEvent {
  static readonly name = "common.queue_event.v2.end";
  static readonly label = "Finalizando procesamiento de cola";
  static readonly requiresNetwork = false;

  readonly name = QueueEndEvent.name;
  readonly label = QueueEndEvent.label;
  readonly requiresNetwork = QueueEndEvent.requiresNetwork;
}

export class QueueAttemptEndEvent extends DomainEvent {
  static readonly name = "common.queue_event.v2.attempt_end";
  static readonly label = "Intento de procesamiento finalizado";
  static readonly requiresNetwork = false;

  readonly name = QueueAttemptEndEvent.name;
  readonly label = QueueAttemptEndEvent.label;
  readonly requiresNetwork = QueueAttemptEndEvent.requiresNetwork;
}
