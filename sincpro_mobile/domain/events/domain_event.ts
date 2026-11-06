import { ValueObject } from "@sincpro/mobile/domain/entity/value_object";
import { generateUUID } from "@sincpro/mobile/infrastructure/database/utils";
import { currentChain, traceparent } from "@sincpro/mobile/infrastructure/event_chain";
import { safeJsonParse, safeJsonStringify } from "@sincpro/mobile/tools/utils/serializer";

import { chainAfter } from "./chain";

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

const ENVELOPE_FIELDS = [
  "name",
  "label",
  "requiresNetwork",
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
  "causationId",
  "entityType",
  "entityVersion",
  "traceparent",
  "sequence",
] as const;

type EnvelopeFields = (typeof ENVELOPE_FIELDS)[number];

const ENVELOPE = new Set<string>(ENVELOPE_FIELDS);

const WIRE_KEYS = new Set<string>([
  ...ENVELOPE_FIELDS,
  "id",
  "created_at",
  "entity_type",
  "entity_id",
  "correlation_id",
  "causation_id",
  "entity_version",
]);

export type DomainEventClass<T extends DomainEvent> = {
  new (...args: any[]): T;
  create(data?: EventData<T>): T;
};

export type EventData<T extends DomainEvent> = Omit<Partial<T>, EnvelopeFields>;

export class DomainEvent extends ValueObject {
  constructor(..._args: any[]) {
    super();
  }
  public readonly name: string = "";
  public readonly label: string = "";

  public readonly uuid: string = "";
  public readonly createdAt: string = "";

  public aggregateId: string | null = null;
  public sourceId: string | null = null;
  public correlationId: string | null = null;
  public causationId: string | null = null;
  public entityType: string = "";
  public entityVersion: number | null = null;
  public traceparent: string | null = null;
  public sequence: number = 0;

  #label: Record<string, string> | null = null;

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

  static create<T extends DomainEvent>(
    this: new (...args: any[]) => T,
    data?: EventData<T>,
  ): T {
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
    return (this as unknown as typeof DomainEvent).fromJSON(event.asJSON()) as T;
  }

  static fromJSON<T>(this: new () => T, json: unknown): T {
    const written = (
      typeof json === "string" ? safeJsonParse(json) : { ...(json as object) }
    ) as Record<string, unknown>;
    if ("created_at" in written && !("createdAt" in written)) {
      return DomainEvent.read(this, written);
    }
    const instance = new this();
    Object.assign(instance as object, written);
    return instance;
  }

  private static read<T>(ctor: new () => T, written: Record<string, unknown>): T {
    const instance = new ctor();
    const event = instance as unknown as DomainEvent;
    const shown = readLabel(written.label);
    Object.assign(event, {
      name: typeof written.name === "string" ? written.name : event.name,
      uuid: asString(written.id, asString(written.uuid, event.uuid)),
      label: shown.text || event.label,
      createdAt: asString(written.created_at, asString(written.createdAt, "")),
      entityType: asString(written.entity_type, ""),
      aggregateId: asString(written.entity_id, null) || asString(written.aggregateId, null),
      correlationId: asString(written.correlation_id, null),
      causationId: asString(written.causation_id, null),
      entityVersion:
        typeof written.entity_version === "number" ? written.entity_version : null,
      traceparent: asString(written.traceparent, null),
      sequence: typeof written.sequence === "number" ? written.sequence : 0,
    });
    event.#label = shown.label;
    for (const [key, value] of Object.entries(written)) {
      if (!WIRE_KEYS.has(key)) {
        (event as unknown as Record<string, unknown>)[key] = value;
      }
    }
    return instance;
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

  withCausationId(causationId: string | null): this {
    this.causationId = causationId;
    return this;
  }

  withEntityType(entityType: string): this {
    this.entityType = entityType;
    return this;
  }

  withSequence(sequence: number): this {
    this.sequence = sequence;
    return this;
  }

  causedBy(cause: DomainEvent): this {
    const chain = chainAfter(cause.uuid, cause.correlationId, this.uuid);
    this.causationId = chain.causationId;
    this.correlationId = chain.correlationId;
    return this;
  }

  applyChain(flowId: string): this {
    const cause = currentChain();
    const chain = cause
      ? chainAfter(cause.causationId, cause.correlationId, this.uuid)
      : chainAfter(null, flowId, this.uuid);
    this.causationId = chain.causationId;
    this.correlationId = chain.correlationId;
    if (!this.traceparent) this.traceparent = traceparent();
    return this;
  }

  getBusinessPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(this)) {
      if (!ENVELOPE.has(key)) payload[key] = value;
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

  asJSON(pretty: boolean = false): string {
    const body: Record<string, unknown> = {
      ...this.getBusinessPayload(),
      name: this.name,
      id: this.uuid,
      label: this.#label ?? { default: this.label },
      created_at: this.createdAt,
      entity_type: this.entityType,
      entity_id: this.aggregateId ?? "",
      correlation_id: this.correlationId,
      causation_id: this.causationId,
      entity_version: this.entityVersion,
      sequence: this.sequence,
    };
    if (this.traceparent) body.traceparent = this.traceparent;
    return safeJsonStringify(body, pretty);
  }
}

function readLabel(label: unknown): { text: string; label: Record<string, string> | null } {
  if (label && typeof label === "object" && !Array.isArray(label)) {
    const text = label as Record<string, string>;
    return { text: text.es || text.default || "", label: text };
  }
  if (typeof label === "string") return { text: label, label: null };
  return { text: "", label: null };
}

function asString(value: unknown, fallback: string): string;
function asString(value: unknown, fallback: null): string | null;
function asString(value: unknown, fallback: string | null): string | null {
  return typeof value === "string" ? value : fallback;
}
