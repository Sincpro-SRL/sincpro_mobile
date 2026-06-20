import { generateUUID } from "@sincpro/mobile/infrastructure/database/utils";
import { safeJsonParse, safeJsonStringify } from "@sincpro/mobile/tools/utils/serializer";

import { ValueObject } from "./value_object";

export type HandlerFn<T> = (payload: T) => Promise<void>;
export type EventName = string;

export interface IEventHandler<Payload = any> {
  name: EventName;
  handler: HandlerFn<Payload>;
}

export enum EEventStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  ACKNOWLEDGED = "ACKNOWLEDGED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

type InfrastructureFields =
  | "name"
  | "label"
  | "requiresNetwork"
  | "uuid"
  | "createdAt"
  | "status"
  | "attempts"
  | "errorMessage"
  | "acknowledgedAt"
  | "failedAt"
  | "aggregateId"
  | "sourceId"
  | "correlationId"
  | "sequence";

export type DomainEventClass<T extends DomainEvent> = {
  new (): T;
  create(data?: EventData<T>): T;
};

export type EventData<T extends DomainEvent> = Omit<Partial<T>, InfrastructureFields>;

export class DomainEvent extends ValueObject {
  public readonly name: string = "";
  public readonly label: string = "";
  public readonly requiresNetwork: boolean = false;

  public readonly uuid: string = "";
  public readonly createdAt: string = "";

  public status: EEventStatus = EEventStatus.PENDING;
  public attempts: number = 0;
  public errorMessage: string | null = null;
  public acknowledgedAt: string | null = null;
  public failedAt: string | null = null;

  public aggregateId: string | null = null;
  public sourceId: string | null = null;
  public correlationId: string | null = null;
  public sequence: number = 0;

  private static sanitize(data: unknown): unknown {
    if (data === null || data === undefined) {
      return data;
    }

    if (data instanceof ValueObject) {
      return safeJsonParse(data.asJSON());
    }

    if (Array.isArray(data)) {
      return data.map((item) => DomainEvent.sanitize(item));
    }

    if (typeof data === "object" && data !== null) {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        result[key] = DomainEvent.sanitize(value);
      }
      return result;
    }

    return data;
  }

  static create<T extends DomainEvent>(this: new () => T, data?: EventData<T>): T {
    const instance = new this();
    if (data) {
      const sanitized = DomainEvent.sanitize(data);
      Object.assign(instance, sanitized);
    }

    Object.assign(instance, {
      uuid: generateUUID(),
      createdAt: new Date().toISOString(),
    });

    return instance;
  }

  static from<T extends DomainEvent>(this: new () => T, event: DomainEvent): T {
    const instance = new this();
    Object.assign(instance, safeJsonParse(event.asJSON()));
    return instance;
  }

  cloneWithReset(): this {
    const clone = (this.constructor as typeof DomainEvent).from(this);
    const mutableClone = clone as DomainEvent;
    Object.assign(mutableClone, {
      uuid: generateUUID(),
      createdAt: new Date().toISOString(),
      status: EEventStatus.PENDING,
      attempts: 0,
      errorMessage: null,
      acknowledgedAt: null,
      failedAt: null,
    });
    return mutableClone as this;
  }

  withAggregateId(aggregateId: string): this {
    this.aggregateId = aggregateId;
    return this;
  }

  withSourceId(sourceId: string): this {
    this.sourceId = sourceId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  withSequence(sequence: number): this {
    this.sequence = sequence;
    return this;
  }

  getBusinessPayload(): Record<string, unknown> {
    const infrastructureKeys = new Set([
      "uuid",
      "createdAt",
      "status",
      "attempts",
      "errorMessage",
      "acknowledgedAt",
      "failedAt",
      "aggregateId",
      "sourceId",
      "correlationId",
      "sequence",
    ]);

    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(this)) {
      if (!infrastructureKeys.has(key)) {
        payload[key] = value;
      }
    }
    return payload;
  }

  hasSameBusinessPayload(other: DomainEvent): boolean {
    if (this.name !== other.name) return false;
    return (
      safeJsonStringify(this.getBusinessPayload()) ===
      safeJsonStringify(other.getBusinessPayload())
    );
  }

  markAsProcessing(): this {
    this.status = EEventStatus.PROCESSING;
    this.attempts += 1;
    return this;
  }

  markAsAcknowledged(): this {
    this.status = EEventStatus.ACKNOWLEDGED;
    this.acknowledgedAt = new Date().toISOString();
    return this;
  }

  markAsFailed(errorMessage: string): this {
    this.status = EEventStatus.FAILED;
    this.errorMessage = errorMessage;
    this.failedAt = new Date().toISOString();
    return this;
  }

  markAsCancelled(): this {
    this.status = EEventStatus.CANCELLED;
    return this;
  }

  retry(): this {
    this.status = EEventStatus.PENDING;
    this.errorMessage = null;
    return this;
  }

  get isPending(): boolean {
    return this.status === EEventStatus.PENDING;
  }

  get isProcessing(): boolean {
    return this.status === EEventStatus.PROCESSING;
  }

  get isAcknowledged(): boolean {
    return this.status === EEventStatus.ACKNOWLEDGED;
  }

  get isFailed(): boolean {
    return this.status === EEventStatus.FAILED;
  }

  get isCancelled(): boolean {
    return this.status === EEventStatus.CANCELLED;
  }

  get isPartOfTransaction(): boolean {
    return this.correlationId !== null;
  }
}

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

export class InternetIsDownEvent extends DomainEvent {
  static readonly name = "common.network.v2.internet_is_down";
  static readonly label = "Internet desconectado";
  static readonly requiresNetwork = false;

  readonly name = InternetIsDownEvent.name;
  readonly label = InternetIsDownEvent.label;
  readonly requiresNetwork = InternetIsDownEvent.requiresNetwork;
}

export class InternetIsUpEvent extends DomainEvent {
  static readonly name = "common.network.v2.internet_is_up";
  static readonly label = "Internet conectado";
  static readonly requiresNetwork = true;

  readonly name = InternetIsUpEvent.name;
  readonly label = InternetIsUpEvent.label;
  readonly requiresNetwork = InternetIsUpEvent.requiresNetwork;
}

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
