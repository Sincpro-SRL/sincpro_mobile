import { DomainValidationError } from "@sincpro/mobile/exceptions";
import { mapped, resolveEntity } from "@sincpro/mobile/infrastructure/database";
import { generateUUID } from "@sincpro/mobile/infrastructure/database/utils";
import { loggerQueueProcessor } from "@sincpro/mobile/infrastructure/logger";
import { EventBus } from "@sincpro/mobile/infrastructure/workers";

import { type DomainEvent, type DomainEventClass, type EventData } from "./event";
import { ECommonRepository } from "./repository";
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

  fromRemoteDTO: (data: any) => this;
  mergeWithRemote: (data: this) => void;
  remotePayload(): any;
}

export interface IEventSourced {
  addDomainEvent<T extends DomainEvent>(
    EventClass: DomainEventClass<T>,
    payload?: EventData<T>,
  ): string;
  addDomainEventWithEntity<T extends DomainEvent>(EventClass: DomainEventClass<T>): string;
  getDomainEvents(): readonly DomainEvent[];
  clearDomainEvents(): void;
  publishAllDomainEvents(): Promise<void>;
  publishAllDomainEventsSync(): Promise<void>;
  publishDomainEvent<T extends DomainEvent>(
    EventClass: DomainEventClass<T>,
    payload: Partial<T>,
  ): Promise<void>;
  publishDomainEventSync<T extends DomainEvent>(
    EventClass: DomainEventClass<T>,
    payload: Partial<T>,
  ): Promise<void>;
  publishDomainEventWithEntity<T extends DomainEvent>(
    EventClass: DomainEventClass<T>,
  ): Promise<void>;
  publishDomainEventWithEntitySync<T extends DomainEvent>(
    EventClass: DomainEventClass<T>,
  ): Promise<void>;
  publishEventWith<T extends DomainEvent>(
    EventClass: DomainEventClass<T>,
    selector: (entity: this) => Partial<T>,
  ): Promise<void>;
  publishEventWithSync<T extends DomainEvent>(
    EventClass: DomainEventClass<T>,
    selector: (entity: this) => Partial<T>,
  ): Promise<void>;
  copyDomainEventsFrom(source: Entity): void;
}

export interface IEntity extends IEventSourced, IValueObject {
  uuid: string;
  name?: string;
  eventIds: string[];

  equals(other: IEntity): boolean;
  clone(): this;
}

export interface IEntityRemote extends IEntity, IRemote {}

export class Entity extends ValueObject implements IEntity {
  public uuid!: string;
  public name?: string;
  public eventIds: string[] = [];

  protected _domainEventsV2: DomainEvent[] = [];
  protected _correlationIdV2: string | null = null;
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

    return instance;
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

  public addDomainEvent<T extends DomainEvent>(
    EventClass: DomainEventClass<T>,
    payload?: EventData<T>,
  ): string {
    const event = EventClass.create(payload);

    const existingEvent = this._domainEventsV2.find((e) => e.hasSameBusinessPayload(event));

    if (existingEvent) {
      loggerQueueProcessor.warn(
        `class ${this.constructor.name} - V2 Event: '${event.name}' with identical payload already exists for entity '${this.uuid}'. Skipping duplicate.`,
      );
      return existingEvent.uuid;
    }

    if (!this._correlationIdV2) {
      this._correlationIdV2 = generateUUID();
    }

    event
      .withAggregateId(this.uuid)
      .withCorrelationId(this._correlationIdV2)
      .withSequence(this._domainEventsV2.length + 1);

    this._domainEventsV2.push(event);
    this.eventIds.push(event.uuid);

    return event.uuid;
  }

  public addDomainEventWithEntity<T extends DomainEvent>(
    EventClass: DomainEventClass<T>,
  ): string {
    const event = EventClass.create({ record: this } as unknown as Partial<T>);

    const existingEvent = this._domainEventsV2.find((e) => e.hasSameBusinessPayload(event));

    if (existingEvent) {
      loggerQueueProcessor.warn(
        `class ${this.constructor.name} - V2 Event: '${event.name}' with identical payload already exists for entity '${this.uuid}'. Skipping duplicate.`,
      );
      return existingEvent.uuid;
    }

    if (!this._correlationIdV2) {
      this._correlationIdV2 = generateUUID();
    }

    event
      .withAggregateId(this.uuid)
      .withCorrelationId(this._correlationIdV2)
      .withSequence(this._domainEventsV2.length + 1);

    this._domainEventsV2.push(event);
    this.eventIds.push(event.uuid);

    return event.uuid;
  }

  public getDomainEvents(): readonly DomainEvent[] {
    return this._domainEventsV2.map((e) => e.clone());
  }

  public copyDomainEventsFrom(source: Entity): void {
    for (const event of source.getDomainEvents()) {
      const clonedEvent = event
        .clone()
        .withAggregateId(this.uuid)
        .withCorrelationId(this._correlationIdV2 || generateUUID())
        .withSequence(this._domainEventsV2.length + 1);

      this._domainEventsV2.push(clonedEvent);
      this.eventIds.push(clonedEvent.uuid);
    }
  }

  public clearDomainEvents(): void {
    this._domainEventsV2 = [];
    this._correlationIdV2 = null;
  }

  public async publishAllDomainEvents(): Promise<void> {
    const events = this._domainEventsV2;
    if (events.length > 1) {
      loggerQueueProcessor.info(
        `class ${this.constructor.name} - Publishing total [${events.length}] V2 domain events for entity '${this.uuid}'`,
      );
    }

    for (const event of events) {
      await EventBus.publish(event);
    }

    this.clearDomainEvents();
  }

  public async publishAllDomainEventsSync(): Promise<void> {
    const events = this._domainEventsV2;
    if (events.length > 1) {
      loggerQueueProcessor.info(
        `class ${this.constructor.name} - Publishing total [${events.length}] V2 domain events for entity '${this.uuid}'`,
      );
    }

    const errors: Error[] = [];
    for (const event of events) {
      try {
        await EventBus.publishSync(event);
      } catch (error) {
        loggerQueueProcessor.warn(
          `class ${this.constructor.name} - Error publishing V2 domain event '${event.name}' for entity '${this.uuid}': ${(error as Error).message}`,
        );
        errors.push(error as Error);
      }
    }

    this.clearDomainEvents();

    if (errors.length > 0) {
      const errorList = errors.map((e) => `  - ${e.message}`).join("\n");
      throw new Error(
        `Errors occurred while publishing V2 domain events synchronously:\n${errorList}`,
      );
    }
  }

  public async publishDomainEvent<T extends DomainEvent>(
    EventClass: DomainEventClass<T>,
    payload: Partial<T>,
  ): Promise<void> {
    this.addDomainEvent(EventClass, payload);
    await this.publishAllDomainEvents();
  }

  public async publishDomainEventSync<T extends DomainEvent>(
    EventClass: DomainEventClass<T>,
    payload: Partial<T>,
  ): Promise<void> {
    this.addDomainEvent(EventClass, payload);
    await this.publishAllDomainEventsSync();
  }

  public async publishDomainEventWithEntity<T extends DomainEvent>(
    EventClass: DomainEventClass<T>,
  ): Promise<void> {
    this.addDomainEventWithEntity(EventClass);
    await this.publishAllDomainEvents();
  }

  public async publishDomainEventWithEntitySync<T extends DomainEvent>(
    EventClass: DomainEventClass<T>,
  ): Promise<void> {
    this.addDomainEventWithEntity(EventClass);
    await this.publishAllDomainEventsSync();
  }

  public async publishEventWith<T extends DomainEvent>(
    EventClass: DomainEventClass<T>,
    selector: (entity: this) => Partial<T>,
  ): Promise<void> {
    const event = EventClass.create(selector(this));
    event.withAggregateId(this.uuid);
    this._domainEventsV2.push(event);
    await this.publishAllDomainEvents();
  }

  public async publishEventWithSync<T extends DomainEvent>(
    EventClass: DomainEventClass<T>,
    selector: (entity: this) => Partial<T>,
  ): Promise<void> {
    const event = EventClass.create(selector(this));
    event.withAggregateId(this.uuid);
    this._domainEventsV2.push(event);
    await this.publishAllDomainEventsSync();
  }
}

export class RemoteEntity extends Entity implements IRemote {
  public remoteId?: number;
  public remoteRef?: string;
  public remoteState: ERemoteState = ERemoteState.PENDING;

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

  public mergeWithRemote(data: this): void {
    const preservedUuid = this.uuid;
    const preservedEventIds = this.eventIds;

    Object.assign(this, data);

    this.uuid = preservedUuid;
    this.eventIds = preservedEventIds;
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
