import { type DomainEvent, logger } from "@sincpro/client-framework";
import {
  type EventRecord,
  type EventValues,
  newEvent,
  type RecordableEvent,
} from "@sincpro/mobile/domain/events/delivery";
import { type Recorded, RecordedEvents } from "@sincpro/mobile/domain/events/recorded";
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

  record<E extends DomainEvent>(
    EventClass: RecordableEvent<E>,
    values?: EventValues<E>,
  ): string;
  recordEntity<E extends DomainEvent>(EventClass: RecordableEvent<E>): string;
  recordedEvents(): readonly Recorded[];
  pullEvents(): Recorded[];
  releaseRecorded(): Recorded[];
  restoreRecorded(recorded: readonly Recorded[]): void;
  copyRecordedFrom(source: Entity): void;
  replaceRecorded(recorded: readonly Recorded[]): void;
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

  protected _recorded = new RecordedEvents();
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
   * The stored events this entity still names (`eventIds`), read from the message store on
   * every access (no cache).
   */
  @mapped(ECommonRepository.STORED_EVENTS, "eventIds")
  get events(): EventRecord[] {
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

  public record<E extends DomainEvent>(
    EventClass: RecordableEvent<E>,
    values?: EventValues<E>,
  ): string {
    return this.stage(newEvent(EventClass, values));
  }

  /** Records `EventClass` carrying this entity, as JSON values. */
  public recordEntity<E extends DomainEvent>(EventClass: RecordableEvent<E>): string {
    return this.stage(
      newEvent(EventClass, {
        record: JSON.parse(this.asJSON()),
      } as unknown as EventValues<E>),
    );
  }

  public recordedEvents(): readonly Recorded[] {
    return this._recorded.list();
  }

  public pullEvents(): Recorded[] {
    return this._recorded.take();
  }

  /** What the repository stores: every record, no longer named by this entity. */
  public releaseRecorded(): Recorded[] {
    const released = this._recorded.take();
    if (released.length > 0) {
      const gone = new Set(released.map((item) => item.id));
      this.eventIds = this.eventIds.filter((id) => !gone.has(id));
    }
    return released;
  }

  public restoreRecorded(recorded: readonly Recorded[]): void {
    this._recorded.restore(recorded);
    for (const item of recorded) {
      if (!this.eventIds.includes(item.id)) this.eventIds.push(item.id);
    }
  }

  public replaceRecorded(recorded: readonly Recorded[]): void {
    this._recorded.replace(recorded);
  }

  public copyRecordedFrom(source: Entity): void {
    for (const item of source.recordedEvents()) this.stage(item.event);
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

  private stage(event: DomainEvent): string {
    const { id, repeated } = this._recorded.record(event);
    if (repeated) {
      logger.warn("An event recorded twice with the same values is kept once", {
        entity: this.constructor.name,
        event: event.name,
        uuid: this.uuid,
      });
      return id;
    }
    this.eventIds.push(id);
    return id;
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
