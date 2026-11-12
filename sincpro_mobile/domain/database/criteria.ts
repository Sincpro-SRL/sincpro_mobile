import {
  type Criteria,
  CriteriaBuilder,
  dynamic,
  type Expression,
  type Filter,
  InvalidCriteria,
  type Param,
} from "@sincpro/criteria";
import { filtered, paginate, sortRows } from "@sincpro/criteria/engine";

/**
 * Where the typed text goes in an entity's literal search (`DEFAULT_LITERAL_SEARCH`): a
 * condition holding it gets the text, and is dropped when the text is blank.
 */
export const TEXT: Param = dynamic.param("text");

/**
 * What the document store accepts.
 *
 * A `Criteria` carries the filter in `selection`. An expression is that filter
 * alone. A `CriteriaBuilder` is read from `.value`.
 */
export type DocumentCriteria<T> = Criteria<T> | CriteriaBuilder<T> | Expression<T>;

/**
 * The rows of a document collection that answer a criteria.
 *
 * The filter is `selection`. It is evaluated by `@sincpro/criteria`, the same
 * engine the server uses, over the entities already in memory. `order` sorts
 * those rows. `pagination` cuts a page only when the criteria asks for one:
 * a filter with no page returns every match. A grouping is not a list of
 * documents, so it is refused.
 */
export function criteriaOf<T>(asked: DocumentCriteria<T>): Criteria<T> {
  if (asked instanceof CriteriaBuilder) return asked.value;
  if (isExpression(asked)) return { selection: asked };
  return asked;
}

/**
 * `asked` over `defaults`, as the backend's `Criteria.replaced_by`: every part `asked` names —
 * order, page (its cursor too), count, specification, grouping — replaces the default's, and
 * its filter joins the default's (AND). What a read puts over what the entity says of itself:
 * the caller wins. A scope that may only narrow is `merge`.
 *
 *     replacedBy({ selection: a, pagination: { limit: 8 }, specification: {} },
 *                { selection: b, pagination: { limit: 20 }, specification: { lines: {} } })
 *       -> { selection: { all: [a, b] }, pagination: { limit: 20 }, specification: { lines: {} } }
 */
export function replacedBy<T>(defaults: Criteria<T>, asked: Criteria<T>): Criteria<T> {
  const named = Object.fromEntries(
    Object.entries(asked).filter(([, value]) => value !== undefined),
  ) as Criteria<T>;
  const selection =
    defaults.selection && asked.selection
      ? ({ all: [defaults.selection, asked.selection] } as Criteria<T>["selection"])
      : (asked.selection ?? defaults.selection);
  return { ...defaults, ...named, ...(selection ? { selection } : {}) };
}

export function rowsMatching<T>(rows: readonly T[], asked: DocumentCriteria<T>): T[] {
  const criteria = criteriaOf(asked);
  if (criteria.grouping !== undefined) {
    throw new InvalidCriteria("a document collection answers a selection, not a grouping");
  }

  const matched = filtered(rows, criteria.selection as Filter<T> | undefined);
  const ordered = criteria.order?.length ? sortRows(matched, criteria.order) : [...matched];
  if (criteria.pagination === undefined) return ordered;
  return paginate(ordered, criteria, criteria.order ?? []).rows;
}

function isExpression<T>(asked: Criteria<T> | Expression<T>): asked is Expression<T> {
  return (
    "field" in asked ||
    "all" in asked ||
    "any" in asked ||
    "negate" in asked ||
    "through" in asked
  );
}
