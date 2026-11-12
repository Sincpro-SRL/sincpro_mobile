import { Command } from "@sincpro/client-framework";
import { type Criteria, type CriteriaFor, type Page, plain } from "@sincpro/criteria";
import type { Entity } from "@sincpro/mobile/domain/entity/entity";
import type { AnyClass } from "@sincpro/mobile/domain/entity/relations";

/**
 * The reads of a local entity as Commands, the backend's `Get`, `GetMany`, `LiteralSearch` and
 * `Search`. A bounded context declares one per use case with the entity it reads, and answers it
 * with an `EntityReads` Feature that has nothing to write:
 *
 *     export class CommandSearchTickets extends Search(Ticket) {}
 *
 *     @ticketsBoundedContext.feature(CommandSearchTickets)
 *     export class SearchTickets extends EntityReads<CommandSearchTickets> {}
 *
 *     await ticketsBoundedContext.execute(new CommandSearchTickets(criteria));   // Page<Ticket>
 *
 * Each takes a `criteria` over what the entity reads by default: the caller's filter joins the
 * read's own, and every other part it names (order, page, count) replaces the default.
 */

/** A value of the field an entity is found by (`DEFAULT_GET_ID`). */
export type ReadKey = string | number;

/** What `GetMany` answers: the records found, in the order asked, and the keys with none. */
export interface Found<T> {
  records: T[];
  missing: ReadKey[];
}

/** One record by its key (`DEFAULT_GET_ID`): the entity, or `AggregateNotFound`. */
export abstract class GetQuery<T extends Entity> extends Command<T> {
  readonly criteria: Criteria<T>;

  constructor(
    readonly id: ReadKey,
    criteria: CriteriaFor<T> = {},
  ) {
    super();
    this.criteria = plain(criteria);
  }
}

/** Several records by their keys, in the order asked: not a page, every key is answered. */
export abstract class GetManyQuery<T extends Entity> extends Command<Found<T>> {
  readonly criteria: Criteria<T>;

  constructor(
    readonly ids: readonly ReadKey[],
    criteria: CriteriaFor<T> = {},
  ) {
    super();
    this.criteria = plain(criteria);
  }
}

/**
 * What a select asks: the text typed, matched as the entity says (`DEFAULT_LITERAL_SEARCH`). A
 * short page in the entity's order; a blank text is its first page.
 */
export abstract class LiteralSearchQuery<T extends Entity> extends Command<Page<T>> {
  readonly criteria: Criteria<T>;

  constructor(
    readonly text: string = "",
    criteria: CriteriaFor<T> = {},
  ) {
    super();
    this.criteria = plain(criteria);
  }
}

/** A page by criteria: its records, the cursor of the next page and how many match. */
export abstract class SearchQuery<T extends Entity> extends Command<Page<T>> {
  readonly criteria: Criteria<T>;

  constructor(criteria: CriteriaFor<T> = {}) {
    super();
    this.criteria = plain(criteria);
  }
}

export type ReadQuery<T extends Entity = Entity> =
  | GetQuery<T>
  | GetManyQuery<T>
  | LiteralSearchQuery<T>
  | SearchQuery<T>;

/** The entity a read Command was declared for (`Get(Ticket)`). */
export type ReadsEntity<T extends Entity> = { readonly entity: AnyClass<T> };

export type GetOf<T extends Entity> = (abstract new (
  id: ReadKey,
  criteria?: CriteriaFor<T>,
) => GetQuery<T>) &
  ReadsEntity<T>;

export type GetManyOf<T extends Entity> = (abstract new (
  ids: readonly ReadKey[],
  criteria?: CriteriaFor<T>,
) => GetManyQuery<T>) &
  ReadsEntity<T>;

export type LiteralSearchOf<T extends Entity> = (abstract new (
  text?: string,
  criteria?: CriteriaFor<T>,
) => LiteralSearchQuery<T>) &
  ReadsEntity<T>;

export type SearchOf<T extends Entity> = (abstract new (
  criteria?: CriteriaFor<T>,
) => SearchQuery<T>) &
  ReadsEntity<T>;

/** The base of a Command that reads one `entity` by its key: `class CommandGetTicket extends Get(Ticket) {}`. */
export function Get<T extends Entity>(entity: AnyClass<T>): GetOf<T> {
  abstract class ReadOne extends GetQuery<T> {
    static readonly entity = entity;
  }
  return ReadOne;
}

/** The base of a Command that reads several of `entity` by their keys. */
export function GetMany<T extends Entity>(entity: AnyClass<T>): GetManyOf<T> {
  abstract class ReadSeveral extends GetManyQuery<T> {
    static readonly entity = entity;
  }
  return ReadSeveral;
}

/** The base of a Command that finds `entity` by a typed text, as a select does. */
export function LiteralSearch<T extends Entity>(entity: AnyClass<T>): LiteralSearchOf<T> {
  abstract class ReadMatching extends LiteralSearchQuery<T> {
    static readonly entity = entity;
  }
  return ReadMatching;
}

/** The base of a Command that reads a page of `entity` by criteria. */
export function Search<T extends Entity>(entity: AnyClass<T>): SearchOf<T> {
  abstract class ReadPage extends SearchQuery<T> {
    static readonly entity = entity;
  }
  return ReadPage;
}
