import {
  type Criteria,
  CriteriaBuilder,
  type Expression,
  type Filter,
  InvalidCriteria,
  isOperator,
  type Operator,
} from "@sincpro/criteria";
import { filtered, paginate, sortRows } from "@sincpro/criteria/engine";

/**
 * A condition written the way repositories wrote it before the engine: a flat
 * list, ANDed, with `not_in` for what the engine spells `not in`.
 */
export interface ICriteria<T = any> {
  field: keyof T;
  operator: string;
  value: any;
}

/**
 * What the document store accepts.
 *
 * A `Criteria` carries the filter in `selection`. An expression is that filter
 * alone. A `CriteriaBuilder` is read from `.value`. A list is the old shape.
 */
export type DocumentCriteria<T> =
  | Criteria<T>
  | CriteriaBuilder<T>
  | Expression<T>
  | readonly ICriteria<T>[];

const LEGACY_OPERATOR: Record<string, Operator> = {
  not_in: "not in",
};

/**
 * The rows of a document collection that answer a criteria.
 *
 * The filter is `selection`. It is evaluated by `@sincpro/criteria`, the same
 * engine the server uses, over the entities already in memory. `order` sorts
 * those rows. `pagination` cuts a page only when the criteria asks for one:
 * a filter with no page returns every match. A grouping is not a list of
 * documents, so it is refused.
 */
export function rowsMatching<T>(rows: readonly T[], asked: DocumentCriteria<T>): T[] {
  const criteria = asCriteria(asked);
  if (criteria.grouping !== undefined) {
    throw new InvalidCriteria("a document collection answers a selection, not a grouping");
  }

  const matched = filtered(rows, criteria.selection as Filter<T> | undefined);
  const ordered = criteria.order?.length ? sortRows(matched, criteria.order) : [...matched];
  if (criteria.pagination === undefined) return ordered;
  return paginate(ordered, criteria, criteria.order ?? []).rows;
}

function asCriteria<T>(asked: DocumentCriteria<T>): Criteria<T> {
  if (isLegacyList(asked)) {
    const selection = legacySelection(asked);
    return selection === undefined ? {} : { selection };
  }
  if (asked instanceof CriteriaBuilder) return asked.value;
  if (isExpression(asked)) return { selection: asked };
  return asked;
}

function isLegacyList<T>(asked: DocumentCriteria<T>): asked is readonly ICriteria<T>[] {
  return Array.isArray(asked);
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

function legacySelection<T>(criteria: readonly ICriteria<T>[]): Expression<T> | undefined {
  const parts = criteria.map(legacyCondition);
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return { all: parts };
}

function legacyCondition<T>(criterion: ICriteria<T>): Expression<T> {
  const written = LEGACY_OPERATOR[criterion.operator] ?? criterion.operator;
  if (!isOperator(written)) {
    throw new InvalidCriteria(
      `'${criterion.operator}' is not an operator the engine declares`,
    );
  }
  return {
    field: String(criterion.field),
    operator: written,
    value: criterion.value,
  } as Expression<T>;
}
