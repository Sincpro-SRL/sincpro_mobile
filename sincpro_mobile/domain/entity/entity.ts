import { logger } from "@sincpro/client-framework";
import {
  type DomainEvent,
  type DomainEventClass,
  type EventData,
} from "@sincpro/mobile/domain/events/domain_event";
import { IntegrationEvent } from "@sincpro/mobile/domain/events/integration_event";
import { ECommonRepository } from "@sincpro/mobile/domain/repositories/catalog";
import { DomainValidationError } from "@sincpro/mobile/exceptions";
import { mapped, resolveEntity } from "@sincpro/mobile/infrastructure/database";
import { generateUUID } from "@sincpro/mobile/infrastructure/database/utils";

import { heldEntities, relations } from "./relations";
import { IValueObject, ValueObject } from "./value_object";

export enum ERemoteState {
  SYNCED = "SYNCED",
  PENDING = "PENDING",
  FAILED = "FAILED",
}

export interface IRemote {
  remoteId?: number;
  remoteRef?: string;
  remoteState: ERemoteState;
  ackedVersion: number;
  readonly isDirty: boolean;

  fromRemoteDTO: (data: any) => this;
  mergeWithRemote: (data: this) => void;
  remotePayload(): any;
}

export interface IEntity extends IValueObject {
  uuid: string;
  name?: string;
  eventIds: string[];
  createdAt: string;
  updatedAt: string | null;
  version: number;
  readonly isNew: boolean;

  equals(other: IEntity): boolean;
  clone(): this;

  record<C extends DomainEventClass<DomainEvent>>(
    EventClass: C,
    payload?: EventData<InstanceType<C>>,
  ): string;
  recordEntity<C extends DomainEventClass<DomainEvent>>(EventClass: C): string;
  recordedEvents(): readonly DomainEvent[];
  pullEvents(): DomainEvent[];
  releaseDeliverable(): IntegrationEvent[];
  restoreRecorded(events: readonly DomainEvent[]): void;
  copyRecordedFrom(source: Entity): void;
  replaceRecorded(events: readonly DomainEvent[]): void;
  noteHeld(): void;
  heldIds(field: string): readonly string[];
}

export interface IEntityRemote extends IEntity, IRemote {}

export class Entity extends ValueObject implements IEntity {
  public uuid!: string;
  public name?: string;
  public eventIds: string[] = [];
  public createdAt: string = "";
  public updatedAt: string | null = null;
  public version: number = 0;

  protected _recordedEvents: DomainEvent[] = [];
  protected _correlationId: string | null = null;
  private _held: Record<string, string[]> = {};
  protected readonly REPOSITORY: string | null = null;

  protected constructor() {
    super();
  }
  static obj<T>(data?: Partial<T>): T {
    const instance = new (this as any)();

    if (data) {
      Object.assign(instance, data);
    }

    if (!instance.uuid) {
      instance.uuid = generateUUID();
    }
    if (!instance.createdAt) {
      instance.createdAt = new Date().toISOString();
    }
    if (typeof instance.version !== "number") {
      instance.version = 0;
    }

    return instance;
  }

  public get isNew(): boolean {
    return this.version === 0;
  }

  /**
   * Resolves domain events collection in runtime from repository.
   * Uses @mapped decorator to automatically query events by eventIds.
   * Returns fresh data on every access (no cache).
   */
  @mapped(ECommonRepository.DOMAIN_EVENT, "eventIds")
  get events(): DomainEvent[] {
    return [];
  }

  /**
   * Reloads this entity from database using its uuid.
   * Returns a fresh copy with latest data from persistence layer.
   *
   * @returns Fresh entity instance from database
   * @throws DomainValidationError if REPOSITORY is not defined in subclass
   *
   * @example
   * const customer = await customerRepo.findById(uuid);
   * // ... some time passes ...
   * const refreshed = await customer.reload();
   */
  public async reload(): Promise<this> {
    if (!this.REPOSITORY) {
      throw new DomainValidationError(
        `Entity ${this.constructor.name} does not have a repository defined for refreshing`,
      );
    }
    return (await resolveEntity(this.REPOSITORY, this.uuid)) as this;
  }

  public equals(other: any): boolean {
    if (!other) return false;
    if (!this.uuid || !other.uuid) return false;
    return this.uuid === other.uuid;
  }

  public record<C extends DomainEventClass<DomainEvent>>(
    EventClass: C,
    payload?: EventData<InstanceType<C>>,
  ): string {
    return this.stageDomainEvent(EventClass.create(payload));
  }

  public recordEntity<C extends DomainEventClass<DomainEvent>>(EventClass: C): string {
    return this.stageDomainEvent(
      EventClass.create({ record: this } as unknown as EventData<InstanceType<C>>),
    );
  }

  public recordedEvents(): readonly DomainEvent[] {
    return this._recordedEvents.map((event) => event.clone());
  }

  public pullEvents(): DomainEvent[] {
    const events = this._recordedEvents;
    this._recordedEvents = [];
    this._correlationId = null;
    return events;
  }

  public releaseDeliverable(): IntegrationEvent[] {
    const kept: DomainEvent[] = [];
    const released: IntegrationEvent[] = [];
    for (const event of this._recordedEvents) {
      if (event instanceof IntegrationEvent) released.push(event);
      else kept.push(event);
    }
    this._recordedEvents = kept;
    if (kept.length === 0) this._correlationId = null;
    if (released.length > 0) {
      const gone = new Set(released.map((event) => event.uuid));
      this.eventIds = this.eventIds.filter((id) => !gone.has(id));
    }
    return released;
  }

  public restoreRecorded(events: readonly DomainEvent[]): void {
    for (const event of events) {
      this._recordedEvents.push(event);
      if (!this.eventIds.includes(event.uuid)) this.eventIds.push(event.uuid);
    }
  }

  public replaceRecorded(events: readonly DomainEvent[]): void {
    this._recordedEvents = [...events];
  }

  public copyRecordedFrom(source: Entity): void {
    for (const event of source.recordedEvents()) {
      this.stageDomainEvent(event.clone());
    }
  }

  public noteHeld(): void {
    const held: Record<string, string[]> = {};
    for (const relation of relations(this)) {
      held[relation.field] = heldEntities(
        (this as unknown as Record<string, unknown>)[relation.field],
      ).map((child) => child.uuid);
    }
    this._held = held;
  }

  public heldIds(field: string): readonly string[] {
    return this._held[field] ?? [];
  }

  private stageDomainEvent(event: DomainEvent): string {
    const existingEvent = this._recordedEvents.find((recorded) =>
      recorded.hasSameBusinessPayload(event),
    );

    if (existingEvent) {
      logger.warn(
        `class ${this.constructor.name} - Event '${event.name}' is already recorded for '${this.uuid}' with the same payload. Skipping.`,
      );
      return existingEvent.uuid;
    }

    if (!this._correlationId) {
      this._correlationId = generateUUID();
    }

    event
      .withEntityType(this.constructor.name)
      .withAggregateId(this.uuid)
      .withSequence(this._recordedEvents.length + 1)
      .applyChain(this._correlationId);

    this._recordedEvents.push(event);
    this.eventIds.push(event.uuid);

    return event.uuid;
  }
}

export class RemoteEntity extends Entity implements IRemote {
  public remoteId?: number;
  public remoteRef?: string;
  public remoteState: ERemoteState = ERemoteState.PENDING;
  public ackedVersion: number = 0;

  protected constructor() {
    super();
  }

  static fromRemoteDTO(data: any): RemoteEntity {
    throw new Error(`${this.name}.fromRemoteDTO debe ser implementado`);
  }

  public fromRemoteDTO(data: any): this {
    return (this.constructor as any).fromRemoteDTO(data) as this;
  }

  /**
   * Reloads this entity from database using its remoteId.
   * Returns a fresh copy with latest data from persistence layer.
   * Uses remote lookup (findByRemoteIdSync) instead of uuid.
   *
   * @returns Fresh entity instance from database
   * @throws DomainValidationError if REPOSITORY is not defined in subclass
   *
   * @example
   * const product = await productRepo.findByRemoteId(123);
   * // ... some time passes ...
   * const refreshed = await product.reloadByRemoteId();
   */
  public async reloadByRemoteId(): Promise<this> {
    if (!this.REPOSITORY) {
      throw new DomainValidationError(
        `Entity ${this.constructor.name} does not have a repository defined for refreshing`,
      );
    }
    return (await resolveEntity(this.REPOSITORY, this.remoteId!, true)) as this;
  }

  public get isDirty(): boolean {
    return this.version === 0 || this.version !== this.ackedVersion;
  }

  public mergeWithRemote(data: this): void {
    const preservedUuid = this.uuid;
    const preservedEventIds = this.eventIds;
    const preservedVersion = this.version;
    const preservedAcked = this.ackedVersion;
    const preservedState = this.remoteState;
    const preservedCreatedAt = this.createdAt;

    Object.assign(this, data);

    this.uuid = preservedUuid;
    this.eventIds = preservedEventIds;
    this.version = preservedVersion;
    this.ackedVersion = preservedAcked;
    this.remoteState = preservedState;
    this.createdAt = preservedCreatedAt;
  }

  public remotePayload(): any {
    throw new Error(`${this.name}.remotePayload debe ser implementado`);
  }

  public markAsSynced(): void {
    this.remoteState = ERemoteState.SYNCED;
  }

  public markAsPending(): void {
    this.remoteState = ERemoteState.PENDING;
  }

  public markAsFailed(): void {
    this.remoteState = ERemoteState.FAILED;
  }
}
