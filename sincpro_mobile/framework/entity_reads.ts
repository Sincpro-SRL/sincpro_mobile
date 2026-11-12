import { type Command, Feature } from "@sincpro/client-framework";
import {
  type Criteria,
  formatOrder,
  matching,
  merge,
  type Meta,
  type Page,
} from "@sincpro/criteria";
import { DocumentRepository } from "@sincpro/mobile/adapters/repositories/document.repository";
import type { Entity } from "@sincpro/mobile/domain/entity/entity";
import type { EntityCollection } from "@sincpro/mobile/domain/entity/entity_collection";
import type { AnyClass } from "@sincpro/mobile/domain/entity/relations";
import {
  type Found,
  GetManyQuery,
  GetQuery,
  LiteralSearchQuery,
  type ReadKey,
  type ReadQuery,
  type ReadsEntity,
  SearchQuery,
} from "@sincpro/mobile/domain/reads/queries";
import { AggregateNotFound, DomainAppError } from "@sincpro/mobile/exceptions";

type AnswerOf<Q> = Q extends Command<infer R> ? R : never;

type EntityOf<Q> = Q extends ReadQuery<infer T> ? T : never;

type DeclaredEntity<T extends Entity> = typeof Entity & AnyClass<T>;

/**
 * The criteria that reads the records of `keys` by `field`, over what `asked` says: one page as
 * long as the keys, uncounted.
 */
function byKeys(asked: Criteria, field: string, keys: readonly ReadKey[]): Criteria {
  return merge(asked, {
    selection:
      keys.length === 1
        ? { field, operator: "=", value: keys[0] }
        : { field, operator: "in", value: [...keys] },
    pagination: { limit: keys.length },
    count: "none",
  });
}

/** What a page of the collection is to a screen: the shape every source answers (`Page`). */
function pageOf<T extends Entity>(collection: EntityCollection<T>): Page<T> {
  return {
    rows: collection.toArray(),
    cursor: collection.cursor,
    count: collection.total,
    meta: null,
    dropped: [],
  };
}

/** What `matching` reads of the entity: its identity, key, order, display and search. */
function readsMetaOf(entity: typeof Entity): Meta {
  return {
    aggregate: entity.name,
    identity: "uuid",
    default_order: formatOrder(entity.DEFAULT_ORDER()),
    fields: {},
    display: entity.DEFAULT_DISPLAY(),
    get_id: entity.DEFAULT_GET_ID(),
    search: entity.DEFAULT_LITERAL_SEARCH() as Record<string, unknown> | null,
  };
}

/**
 * The Feature that answers an entity's reads — `Get`, `GetMany`, `LiteralSearch`, `Search` —
 * from its document repository, the way the entity reads itself (its `DEFAULT_*`). As the
 * backend's `EntityReads`: a use case declares its Command and this Feature, and writes nothing.
 *
 *     export class CommandSearchTickets extends Search(Ticket) {}
 *
 *     @ticketsBoundedContext.feature(CommandSearchTickets)
 *     export class SearchTickets extends EntityReads<CommandSearchTickets> {}
 *
 * Each read is a method: override one and call `super` with a `scope` — a criteria that joins
 * the caller's (its filter ANDs, every other part the caller names wins) — to read within it.
 *
 *     protected override search(query: CommandSearchTickets) {
 *       if (query.includeClosed) return super.search(query);
 *       return super.search(query, { selection: { field: "state", operator: "=", value: "open" } });
 *     }
 *
 * `readsFrom` is the repository read from: the one registered for the entity
 * (`sqliteDocuments(Ticket, …)`) unless overridden.
 */
export abstract class EntityReads<Q extends ReadQuery<any>> extends Feature<
  Q & Command<AnswerOf<Q>>,
  AnswerOf<Q>
> {
  async execute(query: Q): Promise<AnswerOf<Q>> {
    if (query instanceof GetQuery) return (await this.get(query)) as AnswerOf<Q>;
    if (query instanceof GetManyQuery) return (await this.getMany(query)) as AnswerOf<Q>;
    if (query instanceof LiteralSearchQuery) {
      return (await this.literalSearch(query)) as AnswerOf<Q>;
    }
    if (query instanceof SearchQuery) return (await this.search(query)) as AnswerOf<Q>;
    throw new DomainAppError(
      `${this.constructor.name} answers Get, GetMany, LiteralSearch and Search, not ${(query as object).constructor.name}`,
    );
  }

  /** The repository the entity is read from. */
  protected readsFrom(entity: AnyClass<EntityOf<Q>>): DocumentRepository<EntityOf<Q>> {
    return DocumentRepository.of(entity);
  }

  /**
   * The record of the key, as the entity reads it, or `AggregateNotFound`:
   * 1. A page of one, filtered by the entity's key (`DEFAULT_GET_ID`) besides the scope's and
   *    the caller's filters, uncounted.
   * Final: its record; none is `AggregateNotFound`.
   */
  protected async get(
    query: GetQuery<EntityOf<Q>>,
    scope: Criteria = {},
  ): Promise<EntityOf<Q>> {
    const entity = this.entityOf(query);
    const found = await this.readsFrom(entity).search(
      byKeys(this.within(scope, query.criteria), entity.DEFAULT_GET_ID(), [query.id]),
    );
    const record = found.first();
    this.span.set({ "reads.entity": entity.name, "reads.found": record ? 1 : 0 });
    if (!record) throw new AggregateNotFound(`${entity.name} ${query.id} does not exist`);
    return record;
  }

  /**
   * The records of the keys, in the order asked, and the keys that have none:
   * 1. A repeated key is asked once; no key asks nothing.
   * 2. One page as long as the keys, filtered by the entity's key besides the scope's and the
   *    caller's filters.
   * Final: each key's record in the order asked; the keys with none are `missing`.
   */
  protected async getMany(
    query: GetManyQuery<EntityOf<Q>>,
    scope: Criteria = {},
  ): Promise<Found<EntityOf<Q>>> {
    const entity = this.entityOf(query);
    const keys = [...new Set(query.ids)];
    if (keys.length === 0) return { records: [], missing: [] };
    const field = entity.DEFAULT_GET_ID();
    const found = await this.readsFrom(entity).search(
      byKeys(this.within(scope, query.criteria), field, keys),
    );
    const byKey = new Map<string, EntityOf<Q>>();
    for (const record of found.toArray()) {
      byKey.set(String((record as unknown as Record<string, unknown>)[field]), record);
    }
    const records = keys.flatMap((key) => byKey.get(String(key)) ?? []);
    const missing = keys.filter((key) => !byKey.has(String(key)));
    this.span.set({ "reads.entity": entity.name, "reads.missing": missing.length });
    return { records, missing };
  }

  /**
   * The short page a select shows for the text:
   * 1. The entity's literal search filled with the text (`matching`): a blank text drops the
   *    conditions that hold it, an entity that searches nothing finds nothing for a text.
   * 2. The caller's criteria over it, and the scope's filter besides.
   * Final: the page, in the entity's order.
   */
  protected async literalSearch(
    query: LiteralSearchQuery<EntityOf<Q>>,
    scope: Criteria = {},
  ): Promise<Page<EntityOf<Q>>> {
    const entity = this.entityOf(query);
    const asked = merge(
      matching(readsMetaOf(entity), query.text),
      query.criteria as Criteria,
    );
    const page = await this.readsFrom(entity).search(merge(scope, asked));
    this.span.set({ "reads.entity": entity.name, "reads.rows": page.length });
    return pageOf(page);
  }

  /** The page the criteria asks, within the scope: records, the next page's cursor, the count. */
  protected async search(
    query: SearchQuery<EntityOf<Q>>,
    scope: Criteria = {},
  ): Promise<Page<EntityOf<Q>>> {
    const entity = this.entityOf(query);
    const page = await this.readsFrom(entity).search(this.within(scope, query.criteria));
    this.span.set({ "reads.entity": entity.name, "reads.rows": page.length });
    return pageOf(page);
  }

  private within(scope: Criteria, asked: Criteria<EntityOf<Q>>): Criteria {
    return merge(scope, asked as Criteria);
  }

  /** The entity the query asks about: its own (`new CommandSearchEntities(Ticket)`), or its class's (`Search(Ticket)`). */
  private entityOf(query: ReadQuery<EntityOf<Q>>): DeclaredEntity<EntityOf<Q>> {
    const declared =
      (query as Partial<ReadsEntity<EntityOf<Q>>>).entity ??
      (query.constructor as Partial<ReadsEntity<EntityOf<Q>>>).entity;
    if (!declared) {
      throw new DomainAppError(
        `${query.constructor.name} names no entity: pass it (CommandSearchEntities(Ticket, …)) or extend Search(Ticket)`,
      );
    }
    return declared as DeclaredEntity<EntityOf<Q>>;
  }
}
