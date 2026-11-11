import {
  BIND,
  type Cause,
  type DomainEvent,
  type Execution,
  newEntityId,
} from "@sincpro/client-framework";
import { type DocumentCriteria } from "@sincpro/mobile/domain/database/criteria";
import {
  compileCriteria,
  type CriteriaSqlTarget,
} from "@sincpro/mobile/domain/database/criteria_sql";
import { isChangeTracked } from "@sincpro/mobile/domain/entity/change_tracking";
import { assertChecks } from "@sincpro/mobile/domain/entity/checks";
import { Entity, ERemoteState, RemoteEntity } from "@sincpro/mobile/domain/entity/entity";
import { EntityCollection } from "@sincpro/mobile/domain/entity/entity_collection";
import { reconcile } from "@sincpro/mobile/domain/entity/reconcile";
import {
  type AnyClass,
  heldEntities,
  type Relation,
  relationPersists,
  relationRemoves,
  relations,
  relationWrites,
} from "@sincpro/mobile/domain/entity/relations";
import {
  applyAcknowledgement,
  takeAcceptedWrite,
} from "@sincpro/mobile/domain/entity/remote_sync";
import type { Recorded } from "@sincpro/mobile/domain/events/recorded";
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
  type HookMoment,
  Hooks,
} from "@sincpro/mobile/domain/repositories/hooks";
import { type IRepository } from "@sincpro/mobile/domain/repositories/repository";
import { DomainAppError, StaleAggregate } from "@sincpro/mobile/exceptions";
import { eventOutbox } from "@sincpro/mobile/infrastructure/events/outbox";
import {
  envelopeOfRecorded,
  storedEventOf,
} from "@sincpro/mobile/infrastructure/events/stored";

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
  events: Recorded[];
  eventIds: string[];
}

interface Session {
  deliver: boolean;
  outboxes: Set<Outbox>;
  saving: Set<string>;
  remembered: Map<string, Remembered>;
}

const registry = new Map<Function, DocumentRepository<Entity>>();
const hookRepos = new Set<DocumentRepository<Entity>>();

export class DocumentRepository<T extends Entity> implements IRepository<
  T,
  EntityCollection<T>
> {
  private readonly inflight = new Map<string, T>();
  /** The run this view of the repository saves for (`BIND`): its events continue that flow. */
  private readonly cause: Cause | undefined = undefined;

  constructor(
    readonly type: EntityType<T>,
    private readonly store: DocumentStore,
    private readonly options: RepositoryOptions<T> = {},
  ) {
    if (registry.has(type)) {
      throw new DomainAppError(`document repository already registered for ${type.name}`);
    }
    registry.set(type, this as unknown as DocumentRepository<Entity>);
  }

  static reset(): void {
    registry.clear();
    hookRepos.clear();
  }

  async save(
    entity: T | T[] | EntityCollection<T>,
    options?: { deliver?: boolean },
  ): Promise<void> {
    await this.commit(options, async (session) => {
      for (const item of toItems(entity)) await this.persistIn(item, "save", session);
    });
  }

  async upsert(entity: T | T[] | EntityCollection<T>): Promise<void> {
    await this.commit(undefined, async (session) => {
      for (const item of toItems(entity)) await this.persistIn(item, "upsert", session);
    });
  }

  async remove(entity: T | T[]): Promise<void> {
    const items = Array.isArray(entity) ? entity : [entity];
    await this.commit({ deliver: false }, async (session) => {
      for (const item of items) await this.deleteIn(item, session);
    });
  }

  async removeById(uuid: string): Promise<void> {
    await this.commit({ deliver: false }, async (session) => {
      await this.deleteById(session, uuid);
    });
  }

  /**
   * This repository as `execution` uses it — what it is as a dependency of a bounded context: the
   * events it stores continue that run's flow (its `correlationId`, caused by it). The same
   * store, outbox and in-flight aggregates.
   */
  [BIND](execution: Execution): this {
    const cause: Cause = { id: execution.id, correlationId: execution.correlationId };
    return Object.assign(Object.create(this) as this, { cause });
  }

  /** Stores `events` — one flow — and asks for their delivery. */
  async publish(events: readonly DomainEvent[]): Promise<void> {
    this.assertCanWrite();
    const outbox = this.outbox();
    const flow = newEntityId();
    await this.store.transaction(async () => {
      for (const [index, event] of events.entries()) {
        const recorded: Recorded = {
          id: index === 0 ? flow : newEntityId(),
          event,
          sequence: index + 1,
          correlationId: flow,
        };
        await outbox.save(storedEventOf(event, envelopeOfRecorded(recorded, this.cause)));
      }
    });
    outbox.schedule();
  }

  kick(): void {
    this.options.outbox?.schedule();
  }

  async findById(uuid: string): Promise<T | null> {
    return this.loadById(uuid);
  }

  findByIdSync(uuid: string): T | null {
    return this.loadByIdSync(uuid);
  }

  async findByIds(uuids: string[]): Promise<EntityCollection<T>> {
    const found: T[] = [];
    for (const uuid of uuids) {
      const one = await this.loadById(uuid);
      if (one) found.push(one);
    }
    await this.afterSearch(found);
    return new EntityCollection(found);
  }

  findByIdsSync(uuids: string[]): EntityCollection<T> {
    const found: T[] = [];
    for (const uuid of uuids) {
      const one = this.loadByIdSync(uuid);
      if (one) found.push(one);
    }
    return new EntityCollection(found);
  }

  async findAll(): Promise<EntityCollection<T>> {
    const found = await this.readAll();
    await this.afterSearch(found);
    return new EntityCollection(found);
  }

  async findByCriteria(criteria: DocumentCriteria<T>): Promise<EntityCollection<T>> {
    const rows = await this.store.selectMatching(compileCriteria(criteria, this.sqlTarget()));
    const found: T[] = [];
    for (const row of rows) found.push(await this.hydrate(row));
    await this.afterSearch(found);
    return new EntityCollection(found);
  }

  async findByRemoteId(remoteId: number): Promise<T | null> {
    const found = await this.findByColumn("remoteId", remoteId);
    return found[0] ?? null;
  }

  findByRemoteIdSync(remoteId: number): T | null {
    const select = this.store.selectBySync;
    if (!select || !this.store.hasColumn("remoteId")) {
      throw new DomainAppError("this document store cannot query remoteId synchronously");
    }
    const row = select.call(this.store, "remoteId", remoteId)[0];
    return row ? this.hydrateSync(row) : null;
  }

  async findByRemoteIds(remoteIds: number[]): Promise<EntityCollection<T>> {
    const found: T[] = [];
    for (const remoteId of remoteIds)
      found.push(...(await this.findByColumn("remoteId", remoteId)));
    await this.afterSearch(found);
    return new EntityCollection(found);
  }

  async findByRemoteState(
    state: ERemoteState | ERemoteState[],
  ): Promise<EntityCollection<T>> {
    const states = Array.isArray(state) ? state : [state];
    const found: T[] = [];
    for (const one of states) found.push(...(await this.findByColumn("remoteState", one)));
    await this.afterSearch(found);
    return new EntityCollection(found);
  }

  async findDirty(): Promise<EntityCollection<T>> {
    if (!this.store.hasColumn("ackedVersion")) {
      const found = (await this.readAll()).filter(
        (entity) => entity instanceof RemoteEntity && entity.isDirty,
      );
      await this.afterSearch(found);
      return new EntityCollection(found);
    }
    return this.findByCriteria({
      selection: {
        field: "version",
        operator: "!=",
        value: { $: "field", name: "ackedVersion" },
      },
    } as DocumentCriteria<T>);
  }

  async acknowledge(entity: T, remoteId?: number): Promise<void> {
    if (!(entity instanceof RemoteEntity)) {
      throw new DomainAppError("only a remote document can be acknowledged");
    }
    if (entity.version === 0) {
      throw new DomainAppError("acknowledge a document after it has been saved");
    }
    const existing = await this.store.read(entity.uuid);
    if (!existing || storedVersion(existing) !== entity.version) {
      throw new StaleAggregate(
        `${entity.constructor.name} ${entity.uuid} is at version ${existing ? storedVersion(existing) : "none"}, not ${entity.version}`,
      );
    }
    applyAcknowledgement(entity, remoteId);
    const row: DocumentRow = {
      uuid: entity.uuid,
      version: entity.version,
      data: documentData(entity),
      columns: this.columnValues(entity),
    };
    const written = await this.store.update(row, entity.version);
    if (!written) {
      throw new StaleAggregate(
        `${entity.constructor.name} ${entity.uuid} changed while it was acknowledged`,
      );
    }
    if (isChangeTracked(entity)) entity.takeSnapshot();
  }

  async pull(local: T | null, incoming: T): Promise<T> {
    if (!(incoming instanceof RemoteEntity) || (local && !(local instanceof RemoteEntity))) {
      throw new DomainAppError("only a remote document can be pulled");
    }
    const decision = reconcile(local, incoming);
    if (decision.write !== "keep") await this.save(decision.entity as T);
    return decision.entity as T;
  }

  private async commit(
    options: { deliver?: boolean } | undefined,
    work: (session: Session) => Promise<void>,
  ): Promise<void> {
    this.assertCanWrite();
    let session: Session | null = null;
    try {
      await this.store.transaction(async () => {
        session = this.openSession(options);
        await work(session);
      });
      this.schedule(session);
    } catch (error) {
      if (session) restoreSession(session);
      throw error;
    }
  }

  private assertCanWrite(): void {
    const self = this as unknown as DocumentRepository<Entity>;
    if (hookRepos.has(self) || (hookRepos.size > 0 && this.store.inTransaction())) {
      throw new DomainAppError("a hook cannot write through the same repository");
    }
  }

  private async persistIn(
    entity: T,
    kind: "save" | "upsert",
    session: Session,
  ): Promise<void> {
    if (session.saving.has(entity.uuid)) return;
    session.saving.add(entity.uuid);
    remember(session, entity);
    const hooks = this.hooksOf(entity);
    const creating = entity.isNew;
    if (kind === "save") {
      await this.runHooks(hooks, "before_save", entity);
      await this.runHooks(hooks, creating ? "before_create" : "before_update", entity);
      assertChecks(entity);
      await this.cascade(entity, kind, session);
      if (isChangeTracked(entity)) entity.recordChanges();
    } else {
      await this.runHooks(hooks, "before_save", entity);
      await this.cascade(entity, kind, session);
    }
    await this.writeRow(entity, kind === "upsert");
    await this.flush(entity, session);
    entity.noteHeld();
    if (isChangeTracked(entity)) entity.takeSnapshot();
    if (kind === "save") {
      await this.runHooks(hooks, creating ? "after_create" : "after_update", entity);
    }
    await this.runHooks(hooks, "after_save", entity);
  }

  private async cascade(entity: T, kind: "save" | "upsert", session: Session): Promise<void> {
    for (const relation of relations(entity)) {
      const current = heldEntities(fieldOf(entity, relation.field));
      const writes = relationWrites(relation);
      const removes = relationRemoves(relation);
      if (!writes && !removes) continue;
      const repo = this.repositoryFor(relation.type);
      if (removes) {
        const seen = new Set(current.map((child) => child.uuid));
        for (const previous of entity.heldIds(relation.field)) {
          if (!seen.has(previous)) await repo.deleteById(session, previous);
        }
      }
      if (!writes) continue;
      for (const child of current) {
        if (relationPersists(relation, (child as Entity).isNew)) {
          await repo.persistIn(child as Entity, kind, session);
        }
      }
    }
  }

  private async deleteIn(entity: T, session: Session): Promise<void> {
    if (session.saving.has(entity.uuid)) return;
    session.saving.add(entity.uuid);
    remember(session, entity);
    const hooks = this.hooksOf(entity);
    await this.runHooks(hooks, "before_remove", entity);
    for (const relation of relations(entity)) {
      if (!relationRemoves(relation)) continue;
      const repo = this.repositoryFor(relation.type);
      for (const child of heldEntities(fieldOf(entity, relation.field))) {
        await repo.deleteIn(child as Entity, session);
      }
    }
    await this.store.remove(entity.uuid);
    await this.runHooks(hooks, "after_remove", entity);
  }

  private async deleteById(session: Session, uuid: string): Promise<void> {
    const found = await this.loadById(uuid);
    if (found) await this.deleteIn(found, session);
  }

  private async writeRow(entity: T, upsert: boolean): Promise<void> {
    const existing = await this.store.read(entity.uuid);
    const previous = existing ? storedVersion(existing) : null;
    const expected = previous === null ? 0 : previous;
    if (!upsert && expected !== entity.version) {
      throw new StaleAggregate(
        `${entity.constructor.name} ${entity.uuid} is at version ${previous ?? "none"}, not ${entity.version}`,
      );
    }
    entity.version = (previous ?? 0) + 1;
    if (entity instanceof RemoteEntity) {
      if (takeAcceptedWrite(entity)) entity.ackedVersion = entity.version;
      entity.remoteState = entity.isDirty ? ERemoteState.PENDING : ERemoteState.SYNCED;
    }
    entity.updatedAt = new Date().toISOString();
    if (!entity.createdAt) entity.createdAt = entity.updatedAt;
    const row: DocumentRow = {
      uuid: entity.uuid,
      version: entity.version,
      data: documentData(entity),
      columns: this.columnValues(entity),
    };
    if (upsert) {
      await this.store.upsert(row);
      return;
    }
    if (previous === null) {
      try {
        await this.store.insert(row);
      } catch (error) {
        const raced = await this.store.read(entity.uuid);
        if (raced) {
          throw new StaleAggregate(
            `${entity.constructor.name} ${entity.uuid} is at version ${storedVersion(raced)}, not 0`,
          );
        }
        throw error;
      }
      return;
    }
    const written = await this.store.update(row, expected);
    if (!written) {
      const raced = await this.store.read(entity.uuid);
      const current = raced ? storedVersion(raced) : "none";
      throw new StaleAggregate(
        `${entity.constructor.name} ${entity.uuid} is at version ${current}, not ${expected}`,
      );
    }
  }

  private columnValues(entity: T): Record<string, ColumnValue> {
    const columns = { ...(this.options.columns?.(entity) ?? {}) };
    if (!(entity instanceof RemoteEntity)) return columns;
    if (this.store.hasColumn("remoteId") && columns.remoteId === undefined) {
      columns.remoteId = entity.remoteId ?? null;
    }
    if (this.store.hasColumn("remoteState") && columns.remoteState === undefined) {
      columns.remoteState = entity.remoteState;
    }
    if (this.store.hasColumn("ackedVersion") && columns.ackedVersion === undefined) {
      columns.ackedVersion = entity.ackedVersion;
    }
    return columns;
  }

  private async flush(entity: T, session: Session): Promise<void> {
    const recorded = entity.releaseRecorded();
    if (recorded.length === 0) return;
    const outbox = this.options.outbox;
    if (!outbox) {
      if ((this.options.mode ?? StoreMode.LOCAL) === StoreMode.RELAY) {
        throw new DomainAppError("a relay repository needs an outbox");
      }
      entity.restoreRecorded(recorded);
      return;
    }
    for (const item of recorded) {
      await outbox.save(storedEventOf(item.event, envelopeOfRecorded(item, this.cause)));
    }
    if (session.deliver) session.outboxes.add(outbox);
  }

  private async loadById(uuid: string): Promise<T | null> {
    const pending = this.inflight.get(uuid);
    if (pending) return pending;
    const row = await this.store.read(uuid);
    return row ? this.hydrate(row) : null;
  }

  private loadByIdSync(uuid: string): T | null {
    const pending = this.inflight.get(uuid);
    if (pending) return pending;
    const readSync = this.store.readSync;
    if (!readSync) {
      throw new DomainAppError("this document store cannot read synchronously");
    }
    const row = readSync.call(this.store, uuid);
    return row ? this.hydrateSync(row) : null;
  }

  private async hydrate(row: DocumentRow): Promise<T> {
    const pending = this.inflight.get(row.uuid);
    if (pending) return pending;
    const entity = this.materialize(row);
    this.inflight.set(entity.uuid, entity);
    try {
      await this.attachRelations(entity);
      entity.noteHeld();
      await this.runHooks(this.hooksOf(entity), "after_read", entity);
      if (isChangeTracked(entity)) entity.takeSnapshot();
      return entity;
    } finally {
      this.inflight.delete(entity.uuid);
    }
  }

  private hydrateSync(row: DocumentRow): T {
    const pending = this.inflight.get(row.uuid);
    if (pending) return pending;
    const entity = this.materialize(row);
    this.inflight.set(entity.uuid, entity);
    try {
      this.attachRelationsSync(entity);
      entity.noteHeld();
      if (isChangeTracked(entity)) entity.takeSnapshot();
      return entity;
    } finally {
      this.inflight.delete(entity.uuid);
    }
  }

  private materialize(row: DocumentRow): T {
    const parsed = JSON.parse(row.data) as { version?: unknown };
    const entity = (this.type as unknown as { fromJSON(json: unknown): T }).fromJSON(parsed);
    if (typeof row.version === "number" && !Number.isNaN(row.version)) {
      entity.version = row.version;
    } else if (typeof parsed.version !== "number") {
      entity.version = 1;
    }
    if (entity instanceof RemoteEntity) {
      const storedAck = row.columns.ackedVersion;
      if (typeof storedAck === "number" && !Number.isNaN(storedAck)) {
        entity.ackedVersion = storedAck;
      } else if (
        entity.ackedVersion === 0 &&
        entity.remoteState === ERemoteState.SYNCED &&
        entity.version > 0
      ) {
        entity.ackedVersion = entity.version;
      }
    }
    return entity;
  }

  private async attachRelations(entity: T): Promise<void> {
    const record = entity as unknown as Record<string, unknown>;
    for (const relation of relations(entity)) {
      record[relation.field] = await this.resolveRelation(relation, record[relation.field]);
    }
  }

  private attachRelationsSync(entity: T): void {
    const record = entity as unknown as Record<string, unknown>;
    for (const relation of relations(entity)) {
      record[relation.field] = this.resolveRelationSync(relation, record[relation.field]);
    }
  }

  private async resolveRelation(relation: Relation, value: unknown): Promise<unknown> {
    if (Array.isArray(value)) {
      const resolved = [];
      for (const item of value) {
        const one = await this.resolveOne(relation, item);
        if (one != null) resolved.push(one);
      }
      return resolved;
    }
    return this.resolveOne(relation, value);
  }

  private resolveRelationSync(relation: Relation, value: unknown): unknown {
    if (Array.isArray(value)) {
      const resolved = [];
      for (const item of value) {
        const one = this.resolveOneSync(relation, item);
        if (one != null) resolved.push(one);
      }
      return resolved;
    }
    return this.resolveOneSync(relation, value);
  }

  private async resolveOne(relation: Relation, value: unknown): Promise<unknown> {
    if (typeof value === "string") {
      return this.repositoryFor(relation.type).loadById(value);
    }
    if (value && typeof value === "object") return entityFromJSON(relation, value);
    return value ?? null;
  }

  private resolveOneSync(relation: Relation, value: unknown): unknown {
    if (typeof value === "string") {
      return this.repositoryFor(relation.type).loadByIdSync(value);
    }
    if (value && typeof value === "object") return entityFromJSON(relation, value);
    return value ?? null;
  }

  private async findByColumn(column: string, value: ColumnValue): Promise<T[]> {
    if (this.store.hasColumn(column)) {
      const rows = await this.store.selectBy(column, value);
      const found: T[] = [];
      for (const row of rows) found.push(await this.hydrate(row));
      return found;
    }
    const found: T[] = [];
    for (const item of await this.readAll()) {
      if ((item as unknown as Record<string, unknown>)[column] === value) found.push(item);
    }
    return found;
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

  private async runHooks(
    hooks: Hook[],
    moment: Exclude<HookMoment, "after_search">,
    entity: T,
  ): Promise<void> {
    if (hooks.length === 0) return;
    const self = this as unknown as DocumentRepository<Entity>;
    hookRepos.add(self);
    try {
      await fireHooks(hooks, moment, entity);
    } finally {
      hookRepos.delete(self);
    }
  }

  private hooksOf(entity: T): Hook[] {
    return this.options.hooks?.of(entity) ?? [];
  }

  private sqlTarget(): CriteriaSqlTarget {
    return {
      table: this.store.table,
      column: (field) =>
        field === "uuid" || field === "version" || this.store.hasColumn(field),
      relation: (name) => {
        const declared = relations(Object.create(this.type.prototype)).find(
          (item) => item.field === name,
        );
        if (!declared) return undefined;
        return this.repositoryFor(declared.type).sqlTarget();
      },
    };
  }

  private repositoryFor(type: Function): DocumentRepository<Entity> {
    const found = registry.get(type);
    if (!found) throw new DomainAppError(`no document repository for ${type.name}`);
    return found;
  }

  private openSession(options?: { deliver?: boolean }): Session {
    const mode = this.options.mode ?? StoreMode.LOCAL;
    return {
      deliver: options?.deliver ?? mode === StoreMode.RELAY,
      outboxes: new Set(),
      saving: new Set(),
      remembered: new Map(),
    };
  }

  private schedule(session: Session | null): void {
    if (!session?.deliver) return;
    for (const outbox of session.outboxes) outbox.schedule();
  }

  private outbox(): Outbox {
    if (!this.options.outbox) throw new DomainAppError("publish needs an outbox");
    return this.options.outbox;
  }
}

function remember(session: Session, entity: Entity): void {
  if (session.remembered.has(entity.uuid)) return;
  session.remembered.set(entity.uuid, {
    entity,
    version: entity.version,
    updatedAt: entity.updatedAt,
    createdAt: entity.createdAt,
    events: [...entity.recordedEvents()],
    eventIds: [...entity.eventIds],
  });
}

function restoreSession(active: Session): void {
  for (const remembered of active.remembered.values()) {
    remembered.entity.version = remembered.version;
    remembered.entity.updatedAt = remembered.updatedAt;
    remembered.entity.createdAt = remembered.createdAt;
    remembered.entity.eventIds = [...remembered.eventIds];
    remembered.entity.replaceRecorded(remembered.events);
  }
}

function storedVersion(row: DocumentRow): number {
  if (typeof row.version === "number" && !Number.isNaN(row.version)) return row.version;
  const parsed = JSON.parse(row.data) as { version?: unknown };
  return typeof parsed.version === "number" ? parsed.version : 1;
}

function documentData(entity: Entity): string {
  const parsed = JSON.parse(entity.asJSON()) as Record<string, unknown>;
  const record = entity as unknown as Record<string, unknown>;
  for (const relation of relations(entity)) {
    const value = record[relation.field];
    if (Array.isArray(value)) {
      parsed[relation.field] = heldEntities(value).map((child) => child.uuid);
      continue;
    }
    const held = heldEntities(value);
    if (held.length === 1) parsed[relation.field] = held[0].uuid;
  }
  return JSON.stringify(parsed);
}

function fieldOf(entity: Entity, field: string): unknown {
  return (entity as unknown as Record<string, unknown>)[field];
}

function entityFromJSON(relation: Relation, value: unknown): Entity {
  const type = relation.type as unknown as { fromJSON(json: unknown): Entity };
  return type.fromJSON(value);
}

function toItems<T extends Entity>(entity: T | T[] | EntityCollection<T>): T[] {
  if (Array.isArray(entity)) return entity;
  if (entity instanceof EntityCollection) return entity.toArray();
  return [entity];
}

function extendsRemote(type: Function): boolean {
  return type === RemoteEntity || type.prototype instanceof RemoteEntity;
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
  const columns = { ...(spec.columns ?? {}) };
  if (extendsRemote(type)) {
    columns.remoteId ??= (entity) => (entity as unknown as RemoteEntity).remoteId ?? null;
    columns.remoteState ??= (entity) =>
      (entity as unknown as RemoteEntity).remoteState ?? null;
    columns.ackedVersion ??= (entity) =>
      (entity as unknown as RemoteEntity).ackedVersion ?? 0;
  }
  const names = Object.keys(columns);
  const integers = names.filter((name) => name === "remoteId" || name === "ackedVersion");
  const readColumns = (entity: T) => {
    const row: Record<string, ColumnValue> = {};
    for (const name of names) row[name] = columns[name](entity);
    return row;
  };
  const mode = spec.mode ?? StoreMode.LOCAL;
  return new DocumentRepository(type, new SqliteDocumentStore(table, names, integers), {
    mode,
    hooks: spec.hooks,
    outbox: spec.outbox ?? (mode === StoreMode.RELAY ? eventOutbox() : undefined),
    columns: names.length > 0 ? readColumns : undefined,
  });
}
