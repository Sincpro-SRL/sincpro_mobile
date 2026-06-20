import { generateUUID } from "../infrastructure/database/utils";
import { loggerQueueProcessor } from "../infrastructure/logger";
import { EventBus } from "../infrastructure/workers";
import { convertToArray } from "../tools/utils/collections";
import { safeJsonStringify } from "../tools/utils/serializer";
import { type Entity, type RemoteEntity } from "./entity";
import { DomainEvent, type DomainEventClass } from "./event";
import { ValueObject } from "./value_object";

export type CriteriaOperator =
  | "="
  | "!="
  | "in"
  | "not_in"
  | "like"
  | ">"
  | "<"
  | ">="
  | "<=";

export interface ICriteria<T = any> {
  field: keyof T;
  operator: CriteriaOperator;
  value: any;
}

/**
 * Type-safe, immutable collection for Entity aggregates with event sourcing support.
 * Implements IEventSourced for domain event publishing and provides functional operations.
 *
 * @example
 * const collection = new EntityCollection([priceList1, priceList2]);
 *
 * // Functional operations (immutable)
 * const active = collection.filter(pl => pl.isActive).sortBy(pl => pl.name);
 *
 * // Aggregations
 * const total = collection.sumBy(pl => pl.price);
 * const cheapest = collection.minBy(pl => pl.price);
 *
 * // Set operations
 * const union = collection1.union(collection2);
 * const common = collection1.intersect(collection2);
 *
 * // Event sourcing
 * await collection.publishEventWith(PRICE_LISTS_SYNCED, pl => ({ id: pl.remoteId, name: pl.name }));
 */
export class EntityCollection<T extends Entity> extends ValueObject {
  public uuid: string;
  public eventIds: string[] = [];
  private entities: T[] = [];
  private _domainEventsV2: DomainEvent[] = [];
  private _correlationIdV2: string | null = null;

  constructor(entities: T[] = []) {
    super();
    this.uuid = generateUUID();
    this.entities = entities;
  }

  /** Factory method for creating instances - override in subclasses */
  protected createInstance(entities: T[]): this {
    return new EntityCollection(entities) as this;
  }

  /** Creates collection from array of entities - polymorphic, works with subclasses */
  static from<T extends Entity>(
    this: new (entities: T[]) => EntityCollection<T>,
    entities: T[],
  ): EntityCollection<T> {
    return new this(entities);
  }

  /**
   * Converts entity, array, or collection to plain array.
   * Useful for repository save methods that accept multiple input types.
   * Supports: single entity, arrays, Set, EntityCollection
   *
   * @example
   * const entities = EntityCollection.toArrayFrom(entity);
   * // Works with: single entity, array, Set, or EntityCollection
   */
  static toArrayFrom<T extends Entity>(entity: T | T[] | EntityCollection<T>): T[] {
    if (entity instanceof EntityCollection) {
      return entity.toArray();
    }
    return convertToArray(entity);
  }

  /** Returns total number of entities in collection */
  get length(): number {
    return this.entities.length;
  }

  /** Checks if collection has no entities */
  get isEmpty(): boolean {
    return this.entities.length === 0;
  }

  /** Checks if collection has at least one entity */
  get isNotEmpty(): boolean {
    return this.entities.length > 0;
  }

  /**
   * Enables native JavaScript/TypeScript boolean evaluation.
   * Collection behaves like primitives in conditional contexts.
   *
   * Compatible with language keywords:
   * - if (collection) { } // true if has entities
   * - !collection // true if empty
   * - collection && doSomething() // executes if not empty
   * - collection || defaultValue // uses collection if not empty
   * - collection ? a : b // ternary operator
   * - while (collection) { } // loops while not empty
   * - Boolean(collection) // explicit boolean conversion
   * - +collection // converts to number (length)
   * - String(collection) // converts to "EntityCollection(n)"
   *
   * @example
   * if (priceLists) { console.log("Has items"); }
   * const items = priceLists || new EntityCollection();
   * !emptyCollection // true
   */
  [Symbol.toPrimitive](hint: string): boolean | number | string {
    if (hint === "number") {
      return this.length;
    }
    if (hint === "string") {
      return `EntityCollection(${this.length})`;
    }
    return this.isNotEmpty;
  }

  /**
   * Returns numeric value for collection (length).
   * Enables: +collection, Number(collection)
   */
  valueOf(): number {
    return this.length;
  }

  /** Converts collection to plain array (creates new copy) */
  toArray(): T[] {
    return [...this.entities];
  }

  /** Gets entity at specific index (0-based) */
  at(index: number): T | undefined {
    return this.entities[index];
  }

  /** Gets entity at specific index (0-based) */
  get(index: number): T | undefined {
    return this.entities[index];
  }

  /** Checks if collection contains entity (uses Entity.equals) */
  includes(entity: T): boolean {
    return this.entities.some((e) => e.equals(entity));
  }

  /** Finds index of entity in collection (uses Entity.equals) */
  indexOf(entity: T): number {
    return this.entities.findIndex((e) => e.equals(entity));
  }

  /** Concatenates multiple collections into new collection */
  concat(...collections: EntityCollection<T>[]): this {
    const allEntities = [this.entities];
    for (const collection of collections) {
      allEntities.push(collection.toArray());
    }
    return this.createInstance(allEntities.flat());
  }

  /** Returns subset of collection from start to end index */
  slice(start?: number, end?: number): this {
    return this.createInstance(this.entities.slice(start, end));
  }

  /** Returns first entity in collection */
  first(): T | undefined {
    return this.entities[0];
  }

  /** Returns last entity in collection */
  last(): T | undefined {
    return this.entities[this.entities.length - 1];
  }

  /** Adds entity to collection (mutates) */
  add(entity: T): this {
    this.entities.push(entity);
    return this;
  }

  /** Adds multiple entities to collection (mutates) */
  addAll(entities: T[]): this {
    this.entities.push(...entities);
    return this;
  }

  /** Removes entity from collection (mutates, uses Entity.equals) */
  remove(entity: T): this {
    const index = this.entities.findIndex((e) => e.equals(entity));
    if (index !== -1) {
      this.entities.splice(index, 1);
    }
    return this;
  }

  /** Removes all entities from collection (mutates) */
  clear(): this {
    this.entities = [];
    return this;
  }

  /** Makes collection iterable (use with for...of loops) */
  [Symbol.iterator](): Iterator<T> {
    return this.entities[Symbol.iterator]();
  }

  /**
   * Splits collection into chunks of specified size
   * @example
   * const pages = collection.chunk(10); // [[...10], [...10], ...]
   * pages.forEach((page, i) => console.log(`Page ${i}: ${page.length} items`));
   */
  chunk(size: number): this[] {
    const chunks: this[] = [];
    for (let i = 0; i < this.entities.length; i += size) {
      chunks.push(this.createInstance(this.entities.slice(i, i + size)));
    }
    return chunks;
  }

  /** Counts entities matching predicate (returns length if no predicate) */
  count(predicate?: (entity: T) => boolean): number {
    if (!predicate) return this.length;
    return this.entities.filter(predicate).length;
  }

  /** Finds entity with minimum value from selector */
  minBy(selector: (entity: T) => number): T | undefined {
    if (this.isEmpty) return undefined;
    return this.entities.reduce((min, entity) =>
      selector(entity) < selector(min) ? entity : min,
    );
  }

  /** Finds entity with maximum value from selector */
  maxBy(selector: (entity: T) => number): T | undefined {
    if (this.isEmpty) return undefined;
    return this.entities.reduce((max, entity) =>
      selector(entity) > selector(max) ? entity : max,
    );
  }

  /** Sums numeric values from selector across all entities */
  sumBy(selector: (entity: T) => number): number {
    return this.entities.reduce((sum, entity) => sum + selector(entity), 0);
  }

  /** Calculates average of numeric values from selector */
  averageBy(selector: (entity: T) => number): number {
    if (this.isEmpty) return 0;
    return this.sumBy(selector) / this.length;
  }

  /** Finds last entity matching predicate (searches from end) */
  findLast(predicate: (entity: T) => boolean): T | undefined {
    for (let i = this.entities.length - 1; i >= 0; i--) {
      if (predicate(this.entities[i])) {
        return this.entities[i];
      }
    }
    return undefined;
  }

  /**
   * Converts collection to Map using key selector (for fast lookups)
   * @example
   * const priceListMap = collection.toMap(pl => pl.remoteId!);
   * const priceList = priceListMap.get(123); // O(1) lookup
   */
  toMap<K>(keySelector: (entity: T) => K): Map<K, T> {
    const map = new Map<K, T>();
    for (const entity of this.entities) {
      map.set(keySelector(entity), entity);
    }
    return map;
  }

  /**
   * Converts collection to plain object using key and value selectors
   * @example
   * const names = collection.toRecord(pl => pl.remoteId!, pl => pl.name);
   * // { 1: "Premium", 2: "Basic" }
   */
  toRecord<K extends string | number, V>(
    keySelector: (entity: T) => K,
    valueSelector: (entity: T) => V,
  ): Record<K, V> {
    const record = {} as Record<K, V>;
    for (const entity of this.entities) {
      record[keySelector(entity)] = valueSelector(entity);
    }
    return record;
  }

  /** Checks if collection contains any of provided entities */
  containsAny(entities: T[]): boolean {
    return entities.some((entity) => this.includes(entity));
  }

  /** Checks if collection contains all provided entities */
  containsAll(entities: T[]): boolean {
    return entities.every((entity) => this.includes(entity));
  }

  /** Returns new collection with entities matching predicate */
  filter(predicate: (entity: T, index: number) => boolean): this {
    return this.createInstance(this.entities.filter(predicate));
  }

  /** Transforms entities to new type, returns new collection */
  map<R extends Entity>(mapper: (entity: T, index: number) => R): EntityCollection<R> {
    return new EntityCollection(this.entities.map(mapper));
  }

  /** Transforms entities to any type, returns plain array */
  mapToArray<R>(mapper: (entity: T, index: number) => R): R[] {
    return this.entities.map(mapper);
  }

  /** Maps and flattens results into new collection */
  flatMap<R extends Entity>(mapper: (entity: T, index: number) => R[]): EntityCollection<R> {
    return new EntityCollection(this.entities.flatMap(mapper));
  }

  /** Maps and flattens results into plain array */
  flatMapToArray<R>(mapper: (entity: T, index: number) => R[]): R[] {
    return this.entities.flatMap(mapper);
  }

  /** Finds first entity matching predicate */
  find(predicate: (entity: T) => boolean): T | undefined {
    return this.entities.find(predicate);
  }

  /** Finds index of first entity matching predicate */
  findIndex(predicate: (entity: T) => boolean): number {
    return this.entities.findIndex(predicate);
  }

  /** Checks if at least one entity matches predicate */
  some(predicate: (entity: T) => boolean): boolean {
    return this.entities.some(predicate);
  }

  /** Checks if all entities match predicate */
  every(predicate: (entity: T) => boolean): boolean {
    return this.entities.every(predicate);
  }

  /** Executes callback for each entity */
  forEach(callback: (entity: T, index: number) => void): void {
    this.entities.forEach(callback);
  }

  /** Reduces collection to single value using reducer function */
  reduce<R>(reducer: (acc: R, entity: T, index: number) => R, initialValue: R): R {
    return this.entities.reduce(reducer, initialValue);
  }

  /** Sorts collection using compare function, returns new collection */
  sort(compareFn: (a: T, b: T) => number): this {
    return this.createInstance([...this.entities].sort(compareFn));
  }

  /** Sorts collection by key selector, returns new collection */
  sortBy(keySelector: (entity: T) => any): this {
    return this.sort((a, b) => {
      const aVal = keySelector(a);
      const bVal = keySelector(b);
      if (aVal < bVal) return -1;
      if (aVal > bVal) return 1;
      return 0;
    });
  }

  /**
   * Groups entities by key into Map of collections
   * @example
   * const byTyp = collection.groupBy(pl => pl.currencyId);
   * // Map<number, EntityCollection<PriceList>>
   * byType.get(1)?.forEach(pl => console.log(pl.name));
   */
  groupBy<K>(keySelector: (entity: T) => K): Map<K, this> {
    const groups = new Map<K, T[]>();
    for (const entity of this.entities) {
      const key = keySelector(entity);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(entity);
    }

    const result = new Map<K, this>();
    for (const [key, entities] of groups.entries()) {
      result.set(key, this.createInstance(entities));
    }
    return result;
  }

  /**
   * Splits collection into [matching, non-matching] tuple
   * @example
   * const [active, inactive] = collection.partition(pl => pl.isActive);
   */
  partition(predicate: (entity: T) => boolean): [this, this] {
    const truthy: T[] = [];
    const falsy: T[] = [];
    for (const entity of this.entities) {
      if (predicate(entity)) {
        truthy.push(entity);
      } else {
        falsy.push(entity);
      }
    }
    return [this.createInstance(truthy), this.createInstance(falsy)];
  }

  /** Returns collection with unique entities (uses UUID by default or custom key selector) */
  distinct(keySelector?: (entity: T) => any): this {
    if (!keySelector) {
      const seen = new Set<string>();
      const unique: T[] = [];
      for (const entity of this.entities) {
        if (!seen.has(entity.uuid)) {
          seen.add(entity.uuid);
          unique.push(entity);
        }
      }
      return this.createInstance(unique);
    }

    const seen = new Set();
    const unique: T[] = [];
    for (const entity of this.entities) {
      const key = keySelector(entity);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(entity);
      }
    }
    return this.createInstance(unique);
  }

  /** Returns first N entities from collection */
  take(count: number): this {
    return this.createInstance(this.entities.slice(0, count));
  }

  /** Skips first N entities, returns rest */
  skip(count: number): this {
    return this.createInstance(this.entities.slice(count));
  }

  /** Returns union of collections (no duplicates by uuid) */
  union(other: this): this {
    const combined = [...this.entities, ...other.entities];
    return this.createInstance(combined).distinct((e) => e.uuid);
  }

  /** Returns entities present in both collections */
  intersect(other: this): this {
    const otherUuids = new Set(other.mapToArray((e) => e.uuid));
    return this.filter((e) => otherUuids.has(e.uuid));
  }

  /** Returns entities in this collection but not in other */
  except(other: this): this {
    const otherUuids = new Set(other.mapToArray((e) => e.uuid));
    return this.filter((e) => !otherUuids.has(e.uuid));
  }

  /**
   * Returns entities in this collection but not in other using custom selector
   * @example
   * const different = collection1.exceptBy(collection2, e => e.name);
   */
  exceptBy<K>(other: this, keySelector: (entity: T) => K): this {
    const otherKeys = new Set(other.mapToArray(keySelector));
    return this.filter((e) => !otherKeys.has(keySelector(e)));
  }

  /**
   * Finds entity by UUID
   * @example
   * const entity = collection.findByUuid("abc-123-def");
   */
  findByUuid(uuid: string): T | undefined {
    return this.find((e) => e.uuid === uuid);
  }

  /**
   * Finds entities by multiple UUIDs
   * @example
   * const entities = collection.findByUuids(["uuid1", "uuid2", "uuid3"]);
   */
  findByUuids(uuids: string[]): this {
    const uuidSet = new Set(uuids);
    return this.filter((e) => uuidSet.has(e.uuid));
  }

  /**
   * Checks if collection contains entity with given UUID
   * @example
   * if (collection.hasUuid("abc-123")) { ... }
   */
  hasUuid(uuid: string): boolean {
    return this.some((e) => e.uuid === uuid);
  }

  /**
   * Extracts all UUIDs as plain array
   * @example
   * const uuids = collection.getUuids();
   * await deleteByUuids(uuids);
   */
  getUuids(): string[] {
    return this.mapToArray((e) => e.uuid);
  }

  /**
   * Creates a Map indexed by UUID for O(1) lookups
   * @example
   * const byUuid = collection.toMapByUuid();
   * const entity = byUuid.get("abc-123"); // Fast lookup
   */
  toMapByUuid(): Map<string, T> {
    return this.toMap((e) => e.uuid);
  }

  // ============================================
  // V2 METHODS - DomainEvent class-based system
  // ============================================

  addDomainEvent<E extends DomainEvent>(
    EventClass: DomainEventClass<E>,
    payload: Partial<E>,
  ): string {
    const event = EventClass.create(payload);

    const existingEvent = this._domainEventsV2.find((e) => e.hasSameBusinessPayload(event));

    if (existingEvent) {
      loggerQueueProcessor.warn(
        `EntityCollection - V2 Event: '${event.name}' with identical payload already exists. Skipping duplicate.`,
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

    for (const entity of this.entities) {
      entity.eventIds.push(event.uuid);
    }

    return event.uuid;
  }

  addDomainEventWithEntities<E extends DomainEvent>(EventClass: DomainEventClass<E>): string {
    const event = EventClass.create({
      records: this.entities.map((e) => e.asJSON()),
    } as unknown as Partial<E>);

    const existingEvent = this._domainEventsV2.find((e) => e.hasSameBusinessPayload(event));

    if (existingEvent) {
      loggerQueueProcessor.warn(
        `EntityCollection - V2 Event: '${event.name}' with identical payload already exists. Skipping duplicate.`,
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

    for (const entity of this.entities) {
      entity.eventIds.push(event.uuid);
    }

    return event.uuid;
  }

  getDomainEvents(): readonly DomainEvent[] {
    return this._domainEventsV2.map((e) => e.clone());
  }

  clearDomainEvents(): void {
    this._domainEventsV2 = [];
    this._correlationIdV2 = null;
  }

  async publishAllDomainEvents(): Promise<void> {
    const events = this._domainEventsV2;

    for (const event of events) {
      await EventBus.publish(event);
    }

    this.clearDomainEvents();
  }

  async publishAllDomainEventsSync(): Promise<void> {
    const events = this._domainEventsV2;
    const errors: Error[] = [];

    for (const event of events) {
      try {
        await EventBus.publishSync(event);
      } catch (error) {
        loggerQueueProcessor.warn(
          `EntityCollection - Error publishing V2 domain event '${event.name}': ${(error as Error).message}`,
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

  async publishDomainEvent<E extends DomainEvent>(
    EventClass: DomainEventClass<E>,
    payload: Partial<E>,
  ): Promise<void> {
    this.addDomainEvent(EventClass, payload);
    await this.publishAllDomainEvents();
  }

  async publishDomainEventSync<E extends DomainEvent>(
    EventClass: DomainEventClass<E>,
    payload: Partial<E>,
  ): Promise<void> {
    this.addDomainEvent(EventClass, payload);
    await this.publishAllDomainEventsSync();
  }

  async publishDomainEventWithEntities<E extends DomainEvent>(
    EventClass: DomainEventClass<E>,
  ): Promise<void> {
    this.addDomainEventWithEntities(EventClass);
    await this.publishAllDomainEvents();
  }

  async publishDomainEventWithEntitiesSync<E extends DomainEvent>(
    EventClass: DomainEventClass<E>,
  ): Promise<void> {
    this.addDomainEventWithEntities(EventClass);
    await this.publishAllDomainEventsSync();
  }

  /**
   * Serializes collection as array of entity JSONs.
   * Collection is a manager, not an entity, so it serializes as pure entity list.
   * @example
   * const json = collection.asJSON();
   * await saveToDatabase(json);
   */
  override asJSON(pretty: boolean = false): string {
    if (!pretty) {
      return safeJsonStringify(
        this.entities.map((e) => e.asJSON(pretty)),
        pretty,
      );
    }
    return this.entities.map((e) => e.asJSON(pretty)) as any;
  }

  /**
   * Filters entities using criteria array. All criteria must match (AND).
   * @example
   * const filtered = collection.findByCriteria([
   *   { field: 'customerId', operator: '=', value: 123 },
   *   { field: 'state', operator: 'in', value: ['draft', 'posted'] }
   * ]);
   */
  findByCriteria(criteria: ICriteria<T>[]): this {
    const filtered = this.filter((entity) => {
      return criteria.every((c) => {
        const fieldValue = entity[c.field as keyof T];
        switch (c.operator) {
          case "=":
            return fieldValue === c.value;
          case "!=":
            return fieldValue !== c.value;
          case "in":
            return Array.isArray(c.value) && c.value.includes(fieldValue);
          case "not_in":
            return Array.isArray(c.value) && !c.value.includes(fieldValue);
          case "like":
            return (
              typeof fieldValue === "string" &&
              fieldValue.toLowerCase().includes(String(c.value).toLowerCase())
            );
          case ">":
            return fieldValue > c.value;
          case "<":
            return fieldValue < c.value;
          case ">=":
            return fieldValue >= c.value;
          case "<=":
            return fieldValue <= c.value;
          default:
            return false;
        }
      });
    });
    return this.createInstance(filtered.toArray());
  }

  /**
   * Deserializes collection from array of entity JSONs.
   * Collection is a manager, not an entity, so it deserializes from pure entity list.
   * @example
   * const collection = EntityCollection.fromJSON<PriceList>(json, PriceList);
   */
  static override fromJSON<T extends Entity>(
    json: string | any,
    EntityClass?: new () => T,
  ): any {
    if (!EntityClass) {
      throw new Error("EntityClass is required for EntityCollection.fromJSON");
    }

    const data = typeof json === "string" ? JSON.parse(json) : json;

    if (!Array.isArray(data)) {
      throw new Error("EntityCollection.fromJSON expects array of entity JSONs");
    }

    const entities = data.map((entityData: any) =>
      EntityClass.prototype.fromJSON.call(EntityClass, entityData),
    );

    return new EntityCollection<T>(entities);
  }
}

/**
 * Collection for RemoteEntity aggregates with DTO mapping support.
 * Extends EntityCollection with fromRemoteDTO for batch entity creation.
 *
 * @example
 * const collection = RemoteEntityCollection.fromRemoteDTO(
 *   remoteDTOs,
 *   PriceList
 * );
 * await collection.publishIds(PRICE_LISTS_SYNCED);
 */
export class RemoteEntityCollection<T extends RemoteEntity> extends EntityCollection<T> {
  /**
   * Creates collection from remote DTOs using entity's fromRemoteDTO method
   * @example
   * const priceLists = RemoteEntityCollection.fromRemoteDTO(
   *   apiResponse.records,
   *   PriceList
   * );
   */
  static fromRemoteDTO<T extends RemoteEntity>(
    dtos: any[],
    EntityClass: { fromRemoteDTO: (dto: any) => T },
  ): RemoteEntityCollection<T> {
    const entities = dtos.map((dto) => EntityClass.fromRemoteDTO(dto));
    return new RemoteEntityCollection<T>(entities);
  }

  /** Factory method override to create RemoteEntityCollection instances */
  protected override createInstance(entities: T[]): this {
    return new RemoteEntityCollection(entities) as this;
  }

  // ============================================================================
  // INHERITED METHODS - All these return RemoteEntityCollection thanks to createInstance()
  //
  // The following methods are inherited from EntityCollection and automatically
  // return RemoteEntityCollection<T> instead of EntityCollection<T>:
  //
  // - filter(predicate)      → RemoteEntityCollection<T>
  // - partition(predicate)   → [RemoteEntityCollection<T>, RemoteEntityCollection<T>]
  // - findByCriteria(criteria) → RemoteEntityCollection<T>
  // - distinct(keySelector?) → RemoteEntityCollection<T>
  // - slice(start?, end?)    → RemoteEntityCollection<T>
  // - take(count)            → RemoteEntityCollection<T>
  // - skip(count)            → RemoteEntityCollection<T>
  // - sort(compareFn)        → RemoteEntityCollection<T>
  // - sortBy(keySelector)    → RemoteEntityCollection<T>
  // - concat(...collections) → RemoteEntityCollection<T>
  // - chunk(size)            → RemoteEntityCollection<T>[]
  // - groupBy(keySelector)   → Map<K, RemoteEntityCollection<T>>
  // - union(other)           → RemoteEntityCollection<T>
  // - intersect(other)       → RemoteEntityCollection<T>
  // - except(other)          → RemoteEntityCollection<T>
  // - exceptBy(other, key)   → RemoteEntityCollection<T>
  // ============================================================================

  /**
   * Finds entity by remoteId
   * Returns undefined if entity doesn't have remoteId or not found
   * @example
   * const customer = customers.findByRemoteId(123);
   */
  findByRemoteId(remoteId: number): T | undefined {
    return this.find((e) => e.remoteId === remoteId);
  }

  /**
   * Finds entities by multiple remoteIds
   * @example
   * const products = collection.findByRemoteIds([1, 2, 3, 4, 5]);
   */
  findByRemoteIds(remoteIds: number[]): RemoteEntityCollection<T> {
    const remoteIdSet = new Set(remoteIds);
    return new RemoteEntityCollection(
      this.filter((e) => e.remoteId != null && remoteIdSet.has(e.remoteId)).toArray(),
    );
  }

  /**
   * Checks if collection contains entity with given remoteId
   * @example
   * if (customers.hasRemoteId(123)) { ... }
   */
  hasRemoteId(remoteId: number): boolean {
    return this.some((e) => e.remoteId === remoteId);
  }

  /**
   * Returns entities that have remoteId set (synced with backend)
   * @example
   * const syncedEntities = collection.withRemoteId();
   */
  withRemoteId(): RemoteEntityCollection<T> {
    return new RemoteEntityCollection(this.filter((e) => e.remoteId != null).toArray());
  }

  /**
   * Returns entities without remoteId (local-only, not synced)
   * @example
   * const localOnlyEntities = collection.withoutRemoteId();
   */
  withoutRemoteId(): RemoteEntityCollection<T> {
    return new RemoteEntityCollection(this.filter((e) => e.remoteId == null).toArray());
  }

  /**
   * Extracts all remoteIds as plain array (filters out null/undefined)
   * @example
   * const remoteIds = collection.getRemoteIds();
   * await syncWithBackend(remoteIds);
   */
  getRemoteIds(): number[] {
    return this.mapToArray((e) => e.remoteId).filter((id) => id != null);
  }

  /**
   * Creates a Map indexed by remoteId for O(1) lookups
   * Filters out entities without remoteId
   * @example
   * const byRemoteId = collection.toMapByRemoteId();
   * const customer = byRemoteId.get(123); // Fast lookup
   */
  toMapByRemoteId(): Map<number, T> {
    const map = new Map<number, T>();
    for (const entity of this) {
      if (entity.remoteId != null) {
        map.set(entity.remoteId, entity);
      }
    }
    return map;
  }

  /**
   * Returns entities in this collection but not in other, comparing by remoteId
   * Useful for finding entities that exist locally but not in backend response
   * @example
   * const localOnly = localCollection.exceptByRemoteId(backendCollection);
   */
  exceptByRemoteId(other: RemoteEntityCollection<T>): RemoteEntityCollection<T> {
    const otherRemoteIds = new Set(other.getRemoteIds());
    return new RemoteEntityCollection(
      this.filter((e) => e.remoteId == null || !otherRemoteIds.has(e.remoteId)).toArray(),
    );
  }

  /**
   * Returns entities present in both collections, comparing by remoteId
   * Useful for finding entities that exist in both local and backend
   * @example
   * const inBoth = localCollection.intersectByRemoteId(backendCollection);
   */
  intersectByRemoteId(other: RemoteEntityCollection<T>): RemoteEntityCollection<T> {
    const otherRemoteIds = new Set(other.getRemoteIds());
    return new RemoteEntityCollection(
      this.filter((e) => e.remoteId != null && otherRemoteIds.has(e.remoteId)).toArray(),
    );
  }

  /**
   * Removes duplicates by remoteId (keeps first occurrence)
   * Entities without remoteId are kept and deduplicated by uuid
   * @example
   * const unique = collection.distinctByRemoteId();
   */
  distinctByRemoteId(): RemoteEntityCollection<T> {
    const seen = new Set<number | string>();
    const unique: T[] = [];

    for (const entity of this) {
      const key = entity.remoteId ?? entity.uuid;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(entity);
      }
    }

    return new RemoteEntityCollection(unique);
  }

  /**
   * Filters entities pending synchronization with backend
   * @example
   * const pending = collection.findPendingSync();
   * for (const entity of pending) {
   *   await pushToBackend(entity);
   * }
   */
  findPendingSync(): RemoteEntityCollection<T> {
    return new RemoteEntityCollection(
      this.filter((e) => e.remoteState === "PENDING").toArray(),
    );
  }

  /**
   * Filters entities successfully synced with backend
   * @example
   * const synced = collection.findSynced();
   * console.log(`${synced.length} entities synced`);
   */
  findSynced(): RemoteEntityCollection<T> {
    return new RemoteEntityCollection(
      this.filter((e) => e.remoteState === "SYNCED").toArray(),
    );
  }

  /**
   * Filters entities that failed synchronization
   * @example
   * const failed = collection.findFailed();
   * failed.forEach(e => logger.error(`Failed to sync: ${e.uuid}`));
   */
  findFailed(): RemoteEntityCollection<T> {
    return new RemoteEntityCollection(
      this.filter((e) => e.remoteState === "FAILED").toArray(),
    );
  }

  /**
   * Groups entities by remote state
   * @example
   * const byState = collection.groupByRemoteState();
   * console.log(`Pending: ${byState.get('PENDING')?.length}`);
   */
  groupByRemoteState(): Map<string, RemoteEntityCollection<T>> {
    const groups = this.groupBy((e) => e.remoteState);
    const result = new Map<string, RemoteEntityCollection<T>>();
    for (const [state, entities] of groups.entries()) {
      result.set(state, new RemoteEntityCollection(entities.toArray()));
    }
    return result;
  }
}
