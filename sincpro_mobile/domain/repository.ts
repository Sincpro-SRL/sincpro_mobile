import { Entity, ERemoteState, RemoteEntity } from "./entity";
import { EntityCollection, ICriteria, RemoteEntityCollection } from "./entity_collection";

export interface IRepository<T extends Entity, C extends EntityCollection<T>> {
  save(entity: T | T[] | C): Promise<void>;

  remove(entity: T | T[]): Promise<void>;

  findById(id: string): Promise<T | null>;

  findByIds(ids: string[]): Promise<C>;

  findAll(): Promise<C>;

  findByCriteria(criteria: ICriteria<T>[]): Promise<C>;

  findByIdSync?(id: string): T | null;

  findByIdsSync?(ids: string[]): C;
}

export interface IRemoteRepository<T extends RemoteEntity> extends IRepository<
  T,
  RemoteEntityCollection<T>
> {
  findByRemoteState(state: ERemoteState | ERemoteState[]): Promise<RemoteEntityCollection<T>>;

  findByRemoteId(remoteId: number): Promise<T | null>;

  findByRemoteIds(remoteIds: number[]): Promise<RemoteEntityCollection<T>>;

  findByRemoteIdSync?(remoteId: number): T | null;

  findByRemoteIdsSync?(remoteIds: number[]): RemoteEntityCollection<T>;
}

export enum ECommonRepository {
  DATABASE_TABLE = "common.databaseTable",
  DOMAIN_EVENT = "common.domainEvent",
  DOMAIN_EVENT_DEAD_LETTER = "common.domainEventDeadLetter",
  SETTINGS = "common.settings",
}
