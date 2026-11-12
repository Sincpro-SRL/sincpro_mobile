import type { DomainEvent } from "@sincpro/client-framework";
import { type DocumentCriteria } from "@sincpro/mobile/domain/database/criteria";
import { Entity, ERemoteState, RemoteEntity } from "@sincpro/mobile/domain/entity/entity";
import {
  EntityCollection,
  RemoteEntityCollection,
} from "@sincpro/mobile/domain/entity/entity_collection";

/**
 * @deprecated The port of a repository written by hand, with the old words (`findById`,
 * `findAll`, `findByCriteria`). A repository is a `DocumentRepository` now — `get`, `browse`,
 * `search`, `fetchAll`, `first`, `exists`, `count` —, or a class of one's own that extends it
 * (`sqliteDocuments(Entity, table, { repository })`, docs/reads.md). Kept for the apps that still
 * write theirs (Sincpro-SRL/sincpro_mobile_distribution#2); it goes once they move.
 */
export interface IRepository<T extends Entity, C extends EntityCollection<T>> {
  save(entity: T | T[] | C, options?: { deliver?: boolean }): Promise<void>;

  upsert(entity: T | T[] | C): Promise<void>;

  remove(entity: T | T[]): Promise<void>;

  publish(events: readonly DomainEvent[]): Promise<void>;

  findById(id: string): Promise<T | null>;

  findByIds(ids: string[]): Promise<C>;

  findAll(): Promise<C>;

  findByCriteria(criteria: DocumentCriteria<T>): Promise<C>;

  findByIdSync?(id: string): T | null;

  findByIdsSync?(ids: string[]): C;
}

/** @deprecated See `IRepository`: a `DocumentRepository` of a `RemoteEntity` answers all of it. */
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
