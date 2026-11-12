import {
  type Count,
  type CountMode,
  type Criteria,
  type Expression,
  InvalidCriteria,
  isOperator,
  type Operator,
  type Sort,
  type Value,
} from "@sincpro/criteria";
import { DEFAULT_LIMIT, mintCursor, readCursor, signatureOf } from "@sincpro/criteria/engine";

import { criteriaOf, type DocumentCriteria } from "./criteria";
import {
  type CriteriaClock,
  deviceClock,
  periodBounds,
  readCriteriaValue,
} from "./criteria_clock";
import { type SqlParam, type SqlStatement } from "./sql";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_DEPTH = 8;

/**
 * What a criteria is compiled against: the table (or a statement's alias) its fields are read
 * from, which fields are columns — any other is a JSON path of its `data` —, and its relations.
 */
export interface CriteriaSqlTarget {
  table: string;
  column(field: string): boolean;
  relation?(name: string): CriteriaSqlTarget | undefined;
}

export interface FieldRef {
  kind: "column" | "json";
  name: string;
  path: string;
}

/** A criteria as SQL: its filter, its order and its page, the values bound apart. */
export interface CompiledCriteria {
  whereSql: string;
  params: SqlParam[];
  orderSql: string;
  order: { ref: FieldRef; descending: boolean }[];
  limit?: number;
  offset: number;
}

/**
 * One page of a query, as the engine pages: `rows` reads the page (one row more than `limit`,
 * to know whether another follows), `filter` is what a count counts, and `sorts` the ordering
 * a cursor is minted under, its identity closing it.
 */
export interface CompiledPage {
  rows: CompiledCriteria;
  filter: CompiledCriteria;
  limit: number;
  sorts: Sort[];
  resumable: boolean;
  count: CountMode;
}

export type { CriteriaClock };
export { deviceClock };

/** Past how many a count stops and answers "at least": the backend's ceiling. */
export const COUNT_CEILING = 10_000;

/**
 * Every row a criteria matches, as SQL — `selection`, `order` and, when it asks, a page by rows.
 * A grouping is not a list of rows, and a cursor belongs to a page (`compilePage`): both refused.
 */
export function compileCriteria<T>(
  asked: DocumentCriteria<T>,
  target: CriteriaSqlTarget,
  clock: CriteriaClock = deviceClock(),
): CompiledCriteria {
  assertName(target.table, "table");
  if (!(clock.now instanceof Date) || Number.isNaN(clock.now.getTime())) {
    throw new InvalidCriteria("the criteria clock has no instant");
  }
  const criteria = criteriaOf(asked);
  if (criteria.grouping !== undefined) {
    throw new InvalidCriteria("a document query answers a selection, not a grouping");
  }
  const params: SqlParam[] = [];
  const whereSql = criteria.selection
    ? compileExpression(criteria.selection as Expression, target, params, 0, clock)
    : "";
  const order = (criteria.order ?? []).map((sort) => ({
    ref: fieldRef(sort.field, target),
    descending: sort.descending === true,
  }));
  const page = pageOf(criteria.pagination);
  if (
    (page.limit !== undefined || page.offset > 0) &&
    !order.some((item) => item.ref.name === "uuid")
  ) {
    order.push({
      ref: fieldRef("uuid", { ...target, column: () => true }),
      descending: false,
    });
  }
  return {
    whereSql,
    params,
    orderSql: order
      .map((item) => `${sqlOf(target.table, item.ref)} ${item.descending ? "DESC" : "ASC"}`)
      .join(", "),
    order,
    limit: page.limit,
    offset: page.offset,
  };
}

/**
 * The page a criteria asks, compiled as the engine pages it.
 *
 * 1. The order is the criteria's, else `paged.order` (the entity's), closed by its identity
 *    (`uuid` unless `paged.identity` names another unique column) in the direction of the first
 *    sort unless it already names it.
 * 2. The page is `limit` rows (fifty unless the criteria says), after `rows` skipped or past
 *    the row a `token` names. A token minted under another ordering is refused.
 * 3. Past a token is a keyset over the sorts: equal on the sorts before, beyond on this one, in
 *    its own direction. NULL sorts first, as SQLite orders it.
 * Final: the page's statement, the filter alone for the count, and how to mint its cursor.
 */
export function compilePage<T>(
  asked: DocumentCriteria<T>,
  target: CriteriaSqlTarget,
  paged: { order: readonly Sort[]; identity?: string },
  clock: CriteriaClock = deviceClock(),
): CompiledPage {
  const criteria = criteriaOf(asked) as Criteria;
  const sorts = orderingOf(criteria.order ?? [], paged.order, paged.identity ?? "uuid");
  const filter = compileCriteria(
    { selection: criteria.selection, order: sorts, grouping: criteria.grouping },
    target,
    clock,
  );
  const limit = wholeNumber(criteria.pagination?.limit ?? DEFAULT_LIMIT, "a page limit");
  const strategy = criteria.pagination?.strategy;
  const offset =
    strategy && "rows" in strategy ? wholeNumber(strategy.rows, "a page offset") : 0;
  const token = strategy && "token" in strategy ? strategy.token : null;
  const after =
    token === null
      ? null
      : keysetPast(filter, readCursor(token, signatureOf(sorts)).keys, target.table);
  return {
    rows: {
      ...filter,
      whereSql: after ? joinedWhere(filter.whereSql, after.sql) : filter.whereSql,
      params: after ? [...filter.params, ...after.params] : filter.params,
      limit: limit + 1,
      offset,
    },
    filter,
    limit,
    sorts,
    resumable: strategy === undefined || "token" in strategy,
    count: criteria.count ?? "capped",
  };
}

/** A statement read as a table under `alias`: what a criteria filters, orders and pages. */
export function aliased(source: SqlStatement, alias: string): SqlStatement {
  assertName(alias, "alias");
  return { text: `(${source.text}) AS ${alias}`, params: source.params };
}

/** The statement that reads `compiled` from `from`: a table, or a statement `aliased`. */
export function selectStatement(
  compiled: CompiledCriteria,
  from: string | SqlStatement,
  selected = "*",
): SqlStatement {
  const source = typeof from === "string" ? { text: from, params: [] } : from;
  const params: SqlParam[] = [...source.params, ...compiled.params];
  let text = `SELECT ${selected} FROM ${source.text}`;
  if (compiled.whereSql) text += ` WHERE ${compiled.whereSql}`;
  if (compiled.orderSql) text += ` ORDER BY ${compiled.orderSql}`;
  if (compiled.limit !== undefined) {
    text += " LIMIT ?";
    params.push(compiled.limit);
  } else if (compiled.offset > 0) {
    text += " LIMIT -1";
  }
  if (compiled.offset > 0) {
    text += " OFFSET ?";
    params.push(compiled.offset);
  }
  return { text, params };
}

/**
 * The statement that counts what `compiled` filters, its order and page aside; it stops at
 * `ceiling` rows when given. It answers one row, `total`.
 */
export function countStatement(
  compiled: CompiledCriteria,
  from: string | SqlStatement,
  ceiling?: number,
): SqlStatement {
  const source = typeof from === "string" ? { text: from, params: [] } : from;
  const params: SqlParam[] = [...source.params, ...compiled.params];
  let counted = `SELECT 1 FROM ${source.text}`;
  if (compiled.whereSql) counted += ` WHERE ${compiled.whereSql}`;
  if (ceiling !== undefined) {
    counted += " LIMIT ?";
    params.push(ceiling);
  }
  return { text: `SELECT COUNT(*) AS total FROM (${counted})`, params };
}

/** How many rows a count reads at most: every one when exact, one past the ceiling when capped. */
export function countCeiling(mode: "capped" | "exact"): number | undefined {
  return mode === "exact" ? undefined : COUNT_CEILING + 1;
}

/** What a count answers for the rows it saw: past the ceiling it is "at least" the ceiling. */
export function countOf(seen: number, mode: "capped" | "exact"): Count {
  if (mode === "exact") return { value: seen, exact: true };
  return { value: Math.min(seen, COUNT_CEILING), exact: seen <= COUNT_CEILING };
}

/**
 * The token the page after `row` resumes from, under the page's ordering: each sort's value as
 * the row holds it — a column by its name, a JSON field from its `data`.
 */
export function cursorAfter(
  row: Readonly<Record<string, unknown>>,
  page: CompiledPage,
): string {
  const keys: Record<string, unknown> = {};
  page.filter.order.forEach((item, index) => {
    keys[page.sorts[index].field] =
      item.ref.kind === "column"
        ? (row[item.ref.name] ?? null)
        : readJson(String(row.data ?? "{}"), item.ref.path);
  });
  return mintCursor(keys, page.sorts);
}

function orderingOf(
  asked: readonly Sort[],
  defaultOrder: readonly Sort[],
  identity: string,
): Sort[] {
  const sorts = asked.length > 0 ? [...asked] : [...defaultOrder];
  if (sorts.length === 0) return [{ field: identity, descending: true }];
  if (sorts.some((sort) => sort.field === identity)) return sorts;
  return [...sorts, { field: identity, descending: sorts[0].descending === true }];
}

function wholeNumber(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new InvalidCriteria(`${label} is a whole number from zero`);
  }
  return value;
}

function joinedWhere(where: string, after: string): string {
  return where ? `(${where}) AND (${after})` : after;
}

function keysetPast(
  filter: CompiledCriteria,
  keys: readonly unknown[],
  table: string,
): { sql: string; params: SqlParam[] } {
  if (keys.length !== filter.order.length) {
    throw new InvalidCriteria("this cursor does not carry a key for every sort");
  }
  const params: SqlParam[] = [];
  const clauses = filter.order.map((sort, index) => {
    const parts: string[] = [];
    for (let before = 0; before < index; before++) {
      parts.push(equalTo(filter.order[before].ref, keyParam(keys[before]), table, params));
    }
    parts.push(beyondKey(sort, keyParam(keys[index]), table, params));
    return `(${parts.join(" AND ")})`;
  });
  return { sql: `(${clauses.join(" OR ")})`, params };
}

function equalTo(ref: FieldRef, key: SqlParam, table: string, params: SqlParam[]): string {
  const expr = sqlOf(table, ref);
  if (key === null) return `${expr} IS NULL`;
  params.push(key);
  return `${expr} = ?`;
}

function beyondKey(
  sort: { ref: FieldRef; descending: boolean },
  key: SqlParam,
  table: string,
  params: SqlParam[],
): string {
  const expr = sqlOf(table, sort.ref);
  if (!sort.descending && key === null) return `${expr} IS NOT NULL`;
  if (sort.descending && key === null) return "(0)";
  params.push(key);
  return sort.descending ? `(${expr} < ? OR ${expr} IS NULL)` : `${expr} > ?`;
}

function keyParam(value: unknown): SqlParam {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" || typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  throw new InvalidCriteria("a page is ordered by fields that hold one value each");
}

function compileExpression(
  expression: Expression,
  target: CriteriaSqlTarget,
  params: SqlParam[],
  depth: number,
  clock: CriteriaClock,
): string {
  if ("through" in expression && "selection" in expression) {
    return compileThrough(expression, target, params, depth, clock);
  }
  if ("all" in expression) {
    return compileGroup("AND", expression.all, target, params, depth, clock);
  }
  if ("any" in expression) {
    return compileGroup("OR", expression.any, target, params, depth, clock);
  }
  if ("negate" in expression) {
    const inner = compileExpression(expression.negate, target, params, depth, clock);
    return `NOT ((${inner || "1"}) IS TRUE)`;
  }
  if (!("field" in expression) || !isOperator(expression.operator)) {
    throw new InvalidCriteria("a criteria condition needs a field and an operator");
  }
  return compileCondition(
    expression.field,
    expression.operator,
    expression.value,
    target,
    params,
    clock,
  );
}

function compileGroup(
  joiner: "AND" | "OR",
  parts: Expression[],
  target: CriteriaSqlTarget,
  params: SqlParam[],
  depth: number,
  clock: CriteriaClock,
): string {
  if (parts.length === 0) return joiner === "AND" ? "(1)" : "(0)";
  const compiled = parts.map((part) => compileExpression(part, target, params, depth, clock));
  return `(${compiled.join(` ${joiner} `)})`;
}

function compileThrough(
  expression: { through: string; selection: Expression },
  parent: CriteriaSqlTarget,
  params: SqlParam[],
  depth: number,
  clock: CriteriaClock,
): string {
  if (depth >= MAX_DEPTH) {
    throw new InvalidCriteria("a criteria crosses too many relations");
  }
  assertName(expression.through, "relation");
  const child = parent.relation?.(expression.through);
  if (!child) throw new InvalidCriteria(`unknown relation '${expression.through}'`);
  assertName(child.table, "table");
  const inner = compileExpression(expression.selection, child, params, depth + 1, clock);
  const link = `json_extract(${parent.table}.data, '$.${expression.through}')`;
  const each = `json_each(${parent.table}.data, '$.${expression.through}')`;
  return (
    `EXISTS (SELECT 1 FROM ${child.table} WHERE (` +
    `${child.table}.uuid = ${link} OR ${child.table}.uuid IN (SELECT value FROM ${each}))` +
    ` AND (${inner || "1"}))`
  );
}

function compileCondition(
  field: string,
  operator: Operator,
  value: Value,
  target: CriteriaSqlTarget,
  params: SqlParam[],
  clock: CriteriaClock,
): string {
  const expr = sqlOf(target.table, fieldRef(field, target));
  if (isFieldValue(value)) {
    const right = sqlOf(target.table, fieldRef(value.name, target));
    return compare(expr, operator, right, params, undefined, true);
  }
  if (isPeriodValue(value)) {
    if (operator !== "between") {
      throw new InvalidCriteria(
        `a period is a range and takes the operator 'between'; '${field}' asked it with '${operator}'`,
      );
    }
    const [start, end] = periodBounds(value, clock);
    const lower = compileCondition(field, ">=", start, target, params, clock);
    const upper = compileCondition(field, "<", end, target, params, clock);
    return `(${lower} AND ${upper})`;
  }
  const bound = literal(operator, readCriteriaValue(value, clock, field));
  return compare(expr, operator, "?", params, bound, false);
}

function compare(
  left: string,
  operator: Operator,
  rightSql: string,
  params: SqlParam[],
  bound: SqlParam | SqlParam[] | undefined,
  againstField: boolean,
): string {
  if (againstField) {
    switch (operator) {
      case "=":
      case "!=":
      case ">":
      case ">=":
      case "<":
      case "<=":
        return `${left} ${operator} ${rightSql}`;
      default:
        throw new InvalidCriteria(`'${operator}' compares against a value`);
    }
  }
  if (operator === "=" && Array.isArray(bound) && bound.length === 0) {
    return `(${left} IS NULL OR CAST(${left} AS TEXT) = '[]')`;
  }
  if (operator === "!=" && Array.isArray(bound) && bound.length === 0) {
    return `(${left} IS NOT NULL AND CAST(${left} AS TEXT) != '[]')`;
  }
  if ((operator === "=" || operator === "!=") && bound === null) {
    return operator === "=" ? `${left} IS NULL` : `${left} IS NOT NULL`;
  }
  switch (operator) {
    case "=":
    case "!=":
    case ">":
    case ">=":
    case "<":
    case "<=":
      push(params, bound);
      return `${left} ${operator} ${rightSql}`;
    case "between": {
      const pair = pairOf(bound);
      params.push(pair[0], pair[1]);
      return `${left} BETWEEN ? AND ?`;
    }
    case "in":
    case "not in":
      return membership(left, operator === "not in", listOf(bound), params);
    case "is null":
      if (bound !== 0 && bound !== 1) {
        throw new InvalidCriteria("'is null' compares against true or false");
      }
      return bound === 0 ? `${left} IS NOT NULL` : `${left} IS NULL`;
    case "like":
      params.push(`%${escaped(text(bound).toLowerCase())}%`);
      return `lower(${left}) LIKE ? ESCAPE '\\'`;
    case "starts with":
      params.push(`${escaped(text(bound).toLowerCase())}%`);
      return `lower(${left}) LIKE ? ESCAPE '\\'`;
    case "contains":
      params.push(`%"${escaped(text(bound))}"%`);
      return `CAST(${left} AS TEXT) LIKE ? ESCAPE '\\'`;
    case "not contains":
      params.push(`%"${escaped(text(bound))}"%`);
      return `NOT ((CAST(${left} AS TEXT) LIKE ? ESCAPE '\\') IS TRUE)`;
    default:
      throw new InvalidCriteria(`no SQL translation for operator '${operator}'`);
  }
}

function membership(
  left: string,
  negated: boolean,
  values: SqlParam[],
  params: SqlParam[],
): string {
  if (values.length === 0) return negated ? "(1)" : "(0)";
  params.push(...values);
  const marks = values.map(() => "?").join(", ");
  return `${left} ${negated ? "NOT IN" : "IN"} (${marks})`;
}

function pageOf(
  pagination:
    | { limit?: number; strategy?: { token: string | null } | { rows: number } }
    | undefined,
): {
  limit?: number;
  offset: number;
} {
  if (!pagination) return { offset: 0 };
  if (pagination.strategy && "token" in pagination.strategy) {
    throw new InvalidCriteria("a document query pages by rows, not by a token");
  }
  const offset =
    pagination.strategy && "rows" in pagination.strategy ? pagination.strategy.rows : 0;
  if (!Number.isInteger(offset) || offset < 0) {
    throw new InvalidCriteria("a page offset is a whole number from zero");
  }
  if (pagination.limit === undefined) return { offset };
  if (!Number.isInteger(pagination.limit) || pagination.limit < 0) {
    throw new InvalidCriteria("a page limit is a whole number from zero");
  }
  return { limit: pagination.limit, offset };
}

function fieldRef(field: string, target: CriteriaSqlTarget): FieldRef {
  const segments = field.split(".");
  if (segments.length === 0 || segments.some((segment) => !IDENTIFIER.test(segment))) {
    throw new InvalidCriteria(`invalid field '${field}'`);
  }
  if (target.column(field)) {
    if (segments.length !== 1) throw new InvalidCriteria(`'${field}' is not a column`);
    return { kind: "column", name: field, path: "" };
  }
  return { kind: "json", name: field, path: `$.${segments.join(".")}` };
}

function sqlOf(table: string, ref: FieldRef): string {
  if (ref.kind === "column") return `${table}.${ref.name}`;
  return `json_extract(${table}.data, '${ref.path}')`;
}

function literal(operator: Operator, value: Value): SqlParam | SqlParam[] {
  if (operator === "in" || operator === "not in" || operator === "between") {
    if (!Array.isArray(value))
      throw new InvalidCriteria(`'${operator}' compares against a list`);
    return value.map((item) => {
      if (isDynamic(item) || Array.isArray(item)) {
        throw new InvalidCriteria(`'${operator}' compares against text, numbers, or null`);
      }
      return scalarParam(item);
    });
  }
  if (operator === "=" && Array.isArray(value) && value.length === 0) return [];
  if (operator === "!=" && Array.isArray(value) && value.length === 0) return [];
  if (Array.isArray(value) || isDynamic(value)) {
    throw new InvalidCriteria(`'${operator}' compares against one value`);
  }
  if (operator === "is null") {
    if (typeof value !== "boolean") {
      throw new InvalidCriteria("'is null' compares against true or false");
    }
    return value ? 1 : 0;
  }
  return scalarParam(value);
}

function scalarParam(value: string | number | boolean | null | Date): SqlParam {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === null || typeof value === "number" || typeof value === "string") return value;
  throw new InvalidCriteria("a criteria value must be text, a number, or null");
}

function pairOf(bound: SqlParam | SqlParam[] | undefined): [SqlParam, SqlParam] {
  if (!Array.isArray(bound) || bound.length !== 2) {
    throw new InvalidCriteria("'between' compares against two values");
  }
  return [bound[0], bound[1]];
}

function listOf(bound: SqlParam | SqlParam[] | undefined): SqlParam[] {
  if (!Array.isArray(bound)) throw new InvalidCriteria("'in' compares against a list");
  return bound;
}

function push(params: SqlParam[], bound: SqlParam | SqlParam[] | undefined): void {
  if (bound === undefined || Array.isArray(bound)) {
    throw new InvalidCriteria("a comparison needs one value");
  }
  params.push(bound);
}

function text(bound: SqlParam | SqlParam[] | undefined): string {
  if (typeof bound === "string" || typeof bound === "number") return String(bound);
  throw new InvalidCriteria("a text comparison needs text or a number");
}

function escaped(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function isDynamic(value: Value): value is Extract<Value, { $: string }> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    "$" in value
  );
}

function isPeriodValue(value: Value): value is Extract<Value, { $: "period" }> {
  return isDynamic(value) && value.$ === "period";
}

function isFieldValue(value: Value): value is { $: "field"; name: string } {
  return isDynamic(value) && (value as { $: string }).$ === "field";
}

function assertName(name: string, label: string): void {
  if (!IDENTIFIER.test(name)) throw new InvalidCriteria(`invalid ${label} '${name}'`);
}

function readJson(data: string, path: string): unknown {
  const segments = path.startsWith("$.") ? path.slice(2).split(".") : [];
  let current: unknown = JSON.parse(data);
  for (const segment of segments) {
    if (current === null || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return current === undefined ? null : current;
}
