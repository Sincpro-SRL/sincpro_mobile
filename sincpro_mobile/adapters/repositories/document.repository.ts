import {
  type DocumentCriteria,
  rowsMatching,
} from "@sincpro/mobile/domain/database/criteria";
import { isChangeTracked } from "@sincpro/mobile/domain/entity/change_tracking";
import { assertChecks } from "@sincpro/mobile/domain/entity/checks";
import { Entity } from "@sincpro/mobile/domain/entity/entity";
import { EntityCollection } from "@sincpro/mobile/domain/entity/entity_collection";
import {
  type AnyClass,
  heldEntities,
  relationPersists,
  relationRemoves,
  relations,
  relationWrites,
} from "@sincpro/mobile/domain/entity/relations";
import { type DomainEvent } from "@sincpro/mobile/domain/events/domain_event";
import { type IntegrationEvent } from "@sincpro/mobile/domain/events/integration_event";
import {
  type ColumnValue,
  type DocumentRow,
  type DocumentStore,
  type Outbox,
  StoreMode,
} from "@sincpro/mobile/domain/repositories/document_store";
import {
  fireHooks,
  fireSearch,
  type Hook,
  Hooks,
} from "@sincpro/mobile/domain/repositories/hooks";
import { type IRepository } from "@sincpro/mobile/domain/repositories/repository";
import { DomainAppError, StaleAggregate } from "@sincpro/mobile/exceptions";
import { EventBus } from "@sincpro/mobile/infrastructure/workers";

import { DomainEventRepository } from "./domain_event.repository";
import { SqliteDocumentStore } from "./sqlite_document_store";

type EntityType<T extends Entity> = AnyClass<T>;

interface RepositoryOptions<T extends Entity> {
  mode?: StoreMode;
  hooks?: Hooks;
  outbox?: Outbox;
  columns?: (entity: T) => Record<string, ColumnValue>;
}

interface Remembered {
  entity: Entity;
  version: number;
  updatedAt: string | null;
  createdAt: string;
  events: DomainEvent[];
}

interface Session {
  deliver: boolean;
  events: IntegrationEvent[];
  saving: Set<string>;
  remembered: Map<string, Remembered>;
}

const registry = new Map<Function, DocumentRepository<Entity>>();
let session: Session | null = null;

export class DocumentRepository<T extends Entity> implements IRepository<
  T,
  EntityCollection<T>
> {
  private writing = false;

  constructor(
    readonly type: EntityType<T>,
    private readonly store: DocumentStore,
    private readonly options: RepositoryOptions<T> = {},
  ) {
    registry.set(type, this as unknown as DocumentRepository<Entity>);
  }

  static reset(): void {
    registry.clear();
    session = null;
  }

  async save(
    entity: T | T[] | EntityCollection<T>,
    options?: { deliver?: boolean },
  ): Promise<void> {
    await this.inSession(options, async () => {
      for (const item of toItems(entity))
        await this.withWrite(() => this.persist(item, "save"));
    });
  }

  async upsert(entity: T | T[] | EntityCollection<T>): Promise<void> {
    await this.inSession(undefined, async () => {
      for (const item of toItems(entity))
        await this.withWrite(() => this.persist(item, "upsert"));
    });
  }

  async remove(entity: T | T[]): Promise<void> {
    const items = Array.isArray(entity) ? entity : [entity];
    await this.inSession({ deliver: false }, async () => {
      for (const item of items) await this.withWrite(() => this.deleteRow(item));
    });
  }

  async removeById(uuid: string): Promise<void> {
    const found = await this.findById(uuid);
    if (found) await this.remove(found);
  }

  async publish(events: readonly IntegrationEvent[]): Promise<void> {
    const outbox = this.outbox();
    await this.store.transaction(async () => {
      for (const event of events) await outbox.save(event);
    });
    outbox.schedule();
  }

  kick(): void {
    this.options.outbox?.schedule();
  }

  async findById(uuid: string): Promise<T | null> {
    const row = await this.store.read(uuid);
    return row ? this.hydrate(row) : null;
  }

  async findByIds(uuids: string[]): Promise<EntityCollection<T>> {
    const found: T[] = [];
    for (const uuid of uuids) {
      const row = await this.store.read(uuid);
      if (row) found.push(await this.hydrate(row));
    }
    await this.afterSearch(found);
    return new EntityCollection(found);
  }

  async findAll(): Promise<EntityCollection<T>> {
    const found = await this.readAll();
    await this.afterSearch(found);
    return new EntityCollection(found);
  }

  async findByCriteria(criteria: DocumentCriteria<T>): Promise<EntityCollection<T>> {
    const matched = rowsMatching(await this.readAll(), criteria);
    await this.afterSearch(matched);
    return new EntityCollection(matched);
  }

  private async readAll(): Promise<T[]> {
    const rows = await this.store.list();
    const found: T[] = [];
    for (const row of rows) found.push(await this.hydrate(row));
    return found;
  }

  private async afterSearch(records: readonly T[]): Promise<void> {
    await fireSearch(this.options.hooks?.ofType(this.type) ?? [], records);
  }

  private async inSession(
    options: { deliver?: boolean } | undefined,
    work: () => Promise<void>,
  ): Promise<void> {
    const root = session === null;
    if (root) {
      const mode = this.options.mode ?? StoreMode.LOCAL;
      session = {
        deliver: options?.deliver ?? mode === StoreMode.RELAY,
        events: [],
        saving: new Set(),
        remembered: new Map(),
      };
    }
    try {
      await work();
      if (root && session!.deliver && session!.events.length > 0) {
        this.options.outbox?.schedule();
      }
    } catch (error) {
      if (root) restoreSession(session!);
      throw error;
    } finally {
      if (root) session = null;
    }
  }

  private async withWrite(work: () => Promise<void>): Promise<void> {
    if (this.writing) {
      throw new DomainAppError("a hook cannot write through the same repository");
    }
    this.writing = true;
    try {
      await this.store.transaction(work);
    } finally {
      this.writing = false;
    }
  }

  private async persist(entity: T, kind: "save" | "upsert"): Promise<void> {
    if (session!.saving.has(entity.uuid)) return;
    session!.saving.add(entity.uuid);
    remember(entity);
    const hooks = this.hooksOf(entity);
    const creating = entity.isNew;
    if (kind === "save") {
      assertChecks(entity);
      await fireHooks(hooks, "before_save", entity);
      await fireHooks(hooks, creating ? "before_create" : "before_update", entity);
      await this.cascade(entity);
      if (isChangeTracked(entity)) entity.recordChanges();
    } else {
      await fireHooks(hooks, "before_save", entity);
    }
    await this.writeRow(entity, kind === "upsert");
    await this.flush(entity);
    entity.noteHeld();
    if (isChangeTracked(entity)) entity.takeSnapshot();
    if (kind === "save") {
      await fireHooks(hooks, creating ? "after_create" : "after_update", entity);
    }
    await fireHooks(hooks, "after_save", entity);
  }

  private async cascade(entity: T): Promise<void> {
    for (const relation of relations(entity)) {
      const current = heldEntities(
        (entity as unknown as Record<string, unknown>)[relation.field],
      );
      const writes = relationWrites(relation);
      const removes = relationRemoves(relation);
      if (!writes && !removes) continue;
      const repo = this.repositoryFor(relation.type);
      if (removes) {
        const seen = new Set(current.map((child) => child.uuid));
        for (const previous of entity.heldIds(relation.field)) {
          if (!seen.has(previous)) await repo.removeById(previous);
        }
      }
      if (!writes) continue;
      for (const child of current) {
        if (relationPersists(relation, (child as Entity).isNew))
          await repo.save(child as Entity);
      }
    }
  }

  private async deleteRow(entity: T): Promise<void> {
    if (session!.saving.has(entity.uuid)) return;
    session!.saving.add(entity.uuid);
    remember(entity);
    const hooks = this.hooksOf(entity);
    await fireHooks(hooks, "before_remove", entity);
    for (const relation of relations(entity)) {
      if (!relationRemoves(relation)) continue;
      const repo = this.repositoryFor(relation.type);
      for (const child of heldEntities(
        (entity as unknown as Record<string, unknown>)[relation.field],
      )) {
        await repo.remove(child as Entity);
      }
    }
    await this.store.remove(entity.uuid);
    await fireHooks(hooks, "after_remove", entity);
  }

  private async writeRow(entity: T, upsert: boolean): Promise<void> {
    const existing = await this.store.read(entity.uuid);
    const previous = existing ? versionOf(existing) : null;
    const expected = previous === null ? 0 : previous;
    if (!upsert && expected !== entity.version) {
      throw new StaleAggregate(
        `${entity.constructor.name} ${entity.uuid} is at version ${previous ?? "none"}, not ${entity.version}`,
      );
    }
    entity.version = (previous ?? 0) + 1;
    entity.updatedAt = new Date().toISOString();
    if (!entity.createdAt) entity.createdAt = entity.updatedAt;
    await this.store.write({
      uuid: entity.uuid,
      data: entity.asJSON(),
      columns: this.options.columns?.(entity) ?? {},
    });
  }

  private async flush(entity: T): Promise<void> {
    const events = entity.releaseDeliverable();
    if (events.length === 0) return;
    if (!this.options.outbox) {
      if ((this.options.mode ?? StoreMode.LOCAL) === StoreMode.RELAY) {
        throw new DomainAppError("a relay repository needs an outbox");
      }
      entity.restoreRecorded(events);
      return;
    }
    for (const event of events) await this.options.outbox.save(event);
    session!.events.push(...events);
  }

  private async hydrate(row: DocumentRow): Promise<T> {
    const parsed = JSON.parse(row.data) as { version?: unknown };
    const entity = (this.type as unknown as { fromJSON(json: unknown): T }).fromJSON(parsed);
    if (typeof parsed.version !== "number") entity.version = 1;
    this.rehydrateRelations(entity);
    entity.noteHeld();
    await fireHooks(this.hooksOf(entity), "after_read", entity);
    if (isChangeTracked(entity)) entity.takeSnapshot();
    return entity;
  }

  private rehydrateRelations(entity: T): void {
    const record = entity as unknown as Record<string, unknown>;
    for (const relation of relations(entity)) {
      const value = record[relation.field];
      const type = relation.type as unknown as { fromJSON(json: unknown): Entity };
      if (Array.isArray(value)) {
        record[relation.field] = value.map((item) => type.fromJSON(item));
      } else if (value && typeof value === "object") {
        record[relation.field] = type.fromJSON(value);
      }
    }
  }

  private hooksOf(entity: T): Hook[] {
    return this.options.hooks?.of(entity) ?? [];
  }

  private repositoryFor(type: Function): DocumentRepository<Entity> {
    const found = registry.get(type);
    if (!found) throw new DomainAppError(`no document repository for ${type.name}`);
    return found;
  }

  private outbox(): Outbox {
    if (!this.options.outbox) throw new DomainAppError("publish needs an outbox");
    return this.options.outbox;
  }
}

function remember(entity: Entity): void {
  if (session!.remembered.has(entity.uuid)) return;
  session!.remembered.set(entity.uuid, {
    entity,
    version: entity.version,
    updatedAt: entity.updatedAt,
    createdAt: entity.createdAt,
    events: [...entity.recordedEvents()],
  });
}

function restoreSession(active: Session): void {
  for (const remembered of active.remembered.values()) {
    remembered.entity.version = remembered.version;
    remembered.entity.updatedAt = remembered.updatedAt;
    remembered.entity.createdAt = remembered.createdAt;
    remembered.entity.replaceRecorded(remembered.events);
  }
}

function versionOf(row: DocumentRow): number {
  const parsed = JSON.parse(row.data) as { version?: unknown };
  return typeof parsed.version === "number" ? parsed.version : 1;
}

function toItems<T extends Entity>(entity: T | T[] | EntityCollection<T>): T[] {
  if (Array.isArray(entity)) return entity;
  if (entity instanceof EntityCollection) return entity.toArray();
  return [entity];
}

export function sqliteDocuments<T extends Entity>(
  type: EntityType<T>,
  table: string,
  spec: {
    mode?: StoreMode;
    hooks?: Hooks;
    outbox?: Outbox;
    columns?: Record<string, (entity: T) => ColumnValue>;
  } = {},
): DocumentRepository<T> {
  const names = Object.keys(spec.columns ?? {});
  const columns = spec.columns
    ? (entity: T) => {
        const row: Record<string, ColumnValue> = {};
        for (const name of names) row[name] = spec.columns![name](entity);
        return row;
      }
    : undefined;
  const mode = spec.mode ?? StoreMode.LOCAL;
  return new DocumentRepository(type, new SqliteDocumentStore(table, names), {
    mode,
    hooks: spec.hooks,
    outbox: spec.outbox ?? (mode === StoreMode.RELAY ? sqliteOutbox() : undefined),
    columns,
  });
}

function sqliteOutbox(): Outbox {
  return {
    save: (event) => DomainEventRepository.save(event),
    schedule: () => EventBus.schedule(),
  };
}
