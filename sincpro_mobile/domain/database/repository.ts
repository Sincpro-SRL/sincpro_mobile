import { type DocumentCriteria } from "@sincpro/mobile/domain/database/criteria";
import { Entity, ERemoteState, RemoteEntity } from "@sincpro/mobile/domain/entity/entity";
import {
  EntityCollection,
  RemoteEntityCollection,
} from "@sincpro/mobile/domain/entity/entity_collection";

export interface IRepository<T extends Entity, C extends EntityCollection<T>> {
  save(entity: T | T[] | C): Promise<void>;

  remove(entity: T | T[]): Promise<void>;

  findById(id: string): Promise<T | null>;

  findByIds(ids: string[]): Promise<C>;

  findAll(): Promise<C>;

  findByCriteria(criteria: DocumentCriteria<T>): Promise<C>;

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
