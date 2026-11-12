import {
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

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_DEPTH = 8;

export type SqlParam = string | number | null;

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

export type Predicate =
  | { op: "true" }
  | { op: "false" }
  | { op: "not"; item: Predicate }
  | { op: "and" | "or"; items: Predicate[] }
  | { op: "exists"; table: string; link: string; item: Predicate }
  | {
      op: "cmp";
      left: FieldRef;
      operator: Operator;
      right: { field: FieldRef } | { value: SqlParam | SqlParam[] };
    };

export interface CompiledCriteria {
  whereSql: string;
  params: SqlParam[];
  orderSql: string;
  order: { ref: FieldRef; descending: boolean }[];
  limit?: number;
  offset: number;
  predicate: Predicate;
}

export interface SqlDocument {
  uuid: string;
  version: number;
  data: string;
  columns: Record<string, SqlParam>;
}

/**
 * One page of a document query, as the engine pages: `rows` reads the page (one row more than
 * `limit`, to know whether another follows), `filter` is what a count counts, and `sorts` the
 * ordering a cursor is minted under, tiebreaker included.
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
  const compiled = criteria.selection
    ? compileExpression(criteria.selection as Expression, target, params, 0, clock)
    : { sql: "", predicate: { op: "true" } as Predicate };
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
    whereSql: compiled.sql,
    params,
    orderSql: order
      .map((item) => `${sqlOf(target.table, item.ref)} ${item.descending ? "DESC" : "ASC"}`)
      .join(", "),
    order,
    limit: page.limit,
    offset: page.offset,
    predicate: compiled.predicate,
  };
}

export function rowsFor(
  compiled: CompiledCriteria,
  rows: readonly SqlDocument[],
  others: (table: string) => readonly SqlDocument[] = () => [],
): SqlDocument[] {
  const matched = rows.filter((row) => holds(row, compiled.predicate, others));
  const ordered =
    compiled.order.length === 0
      ? [...matched]
      : [...matched].sort((left, right) => compareRows(left, right, compiled.order));
  const start = compiled.offset;
  const end = compiled.limit === undefined ? undefined : start + compiled.limit;
  return ordered.slice(start, end);
}

/**
 * The page a criteria asks of a document collection, compiled as the engine pages it.
 *
 * 1. The order is the criteria's, else `defaultOrder` (the entity's), closed by `uuid` in the
 *    direction of the first sort unless it already names it.
 * 2. The page is `limit` rows (fifty unless the criteria says), after `rows` skipped or past
 *    the row a `token` names. A token minted under another ordering is refused.
 * 3. Past a token is a keyset over the sorts: equal on the sorts before, beyond on this one, in
 *    its own direction. NULL sorts first, as SQLite orders it.
 * Final: the page's statement, the filter alone for the count, and how to mint its cursor.
 */
export function compilePage<T>(
  asked: DocumentCriteria<T>,
  target: CriteriaSqlTarget,
  defaultOrder: readonly Sort[],
  clock: CriteriaClock = deviceClock(),
): CompiledPage {
  const criteria = criteriaOf(asked) as Criteria;
  const sorts = orderingOf(criteria.order ?? [], defaultOrder);
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
      predicate: after
        ? { op: "and", items: [filter.predicate, after.predicate] }
        : filter.predicate,
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

/** The token the page after `row` resumes from, under the page's ordering. */
export function cursorAfter(row: SqlDocument, page: CompiledPage): string {
  const keys: Record<string, unknown> = {};
  page.filter.order.forEach((item, index) => {
    keys[page.sorts[index].field] = readField(row, item.ref);
  });
  return mintCursor(keys, page.sorts);
}

function orderingOf(asked: readonly Sort[], defaultOrder: readonly Sort[]): Sort[] {
  const sorts = asked.length > 0 ? [...asked] : [...defaultOrder];
  if (sorts.length === 0) return [{ field: "uuid", descending: true }];
  if (sorts.some((sort) => sort.field === "uuid")) return sorts;
  return [...sorts, { field: "uuid", descending: sorts[0].descending === true }];
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
): { sql: string; params: SqlParam[]; predicate: Predicate } {
  if (keys.length !== filter.order.length) {
    throw new InvalidCriteria("this cursor does not carry a key for every sort");
  }
  const params: SqlParam[] = [];
  const clauses: string[] = [];
  const items: Predicate[] = [];
  filter.order.forEach((sort, index) => {
    const parts: string[] = [];
    const held: Predicate[] = [];
    for (let before = 0; before < index; before++) {
      const tie = equalTo(filter.order[before].ref, keyParam(keys[before]), table, params);
      parts.push(tie.sql);
      held.push(tie.predicate);
    }
    const beyond = beyondKey(sort, keyParam(keys[index]), table, params);
    parts.push(beyond.sql);
    held.push(beyond.predicate);
    clauses.push(`(${parts.join(" AND ")})`);
    items.push({ op: "and", items: held });
  });
  return { sql: `(${clauses.join(" OR ")})`, params, predicate: { op: "or", items } };
}

function equalTo(
  ref: FieldRef,
  key: SqlParam,
  table: string,
  params: SqlParam[],
): { sql: string; predicate: Predicate } {
  const expr = sqlOf(table, ref);
  const predicate: Predicate = { op: "cmp", left: ref, operator: "=", right: { value: key } };
  if (key === null) return { sql: `${expr} IS NULL`, predicate };
  params.push(key);
  return { sql: `${expr} = ?`, predicate };
}

function beyondKey(
  sort: { ref: FieldRef; descending: boolean },
  key: SqlParam,
  table: string,
  params: SqlParam[],
): { sql: string; predicate: Predicate } {
  const expr = sqlOf(table, sort.ref);
  const isNull: Predicate = {
    op: "cmp",
    left: sort.ref,
    operator: "=",
    right: { value: null },
  };
  if (!sort.descending && key === null) {
    return { sql: `${expr} IS NOT NULL`, predicate: { op: "not", item: isNull } };
  }
  if (sort.descending && key === null) return { sql: "(0)", predicate: { op: "false" } };
  params.push(key);
  const operator = sort.descending ? "<" : ">";
  const past: Predicate = { op: "cmp", left: sort.ref, operator, right: { value: key } };
  if (!sort.descending) return { sql: `${expr} > ?`, predicate: past };
  return {
    sql: `(${expr} < ? OR ${expr} IS NULL)`,
    predicate: { op: "or", items: [past, isNull] },
  };
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
): { sql: string; predicate: Predicate } {
  if ("through" in expression && "selection" in expression) {
    return compileThrough(expression, target, params, depth, clock);
  }
  if ("all" in expression)
    return compileGroup("and", "AND", expression.all, target, params, depth, clock);
  if ("any" in expression)
    return compileGroup("or", "OR", expression.any, target, params, depth, clock);
  if ("negate" in expression) {
    const inner = compileExpression(expression.negate, target, params, depth, clock);
    return {
      sql: `NOT ((${inner.sql || "1"}) IS TRUE)`,
      predicate: { op: "not", item: inner.predicate },
    };
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
  op: "and" | "or",
  sqlOp: "AND" | "OR",
  parts: Expression[],
  target: CriteriaSqlTarget,
  params: SqlParam[],
  depth: number,
  clock: CriteriaClock,
): { sql: string; predicate: Predicate } {
  if (parts.length === 0) {
    const open = op === "and";
    return { sql: open ? "(1)" : "(0)", predicate: { op: open ? "true" : "false" } };
  }
  const compiled = parts.map((part) => compileExpression(part, target, params, depth, clock));
  return {
    sql: `(${compiled.map((part) => part.sql).join(` ${sqlOp} `)})`,
    predicate: { op, items: compiled.map((part) => part.predicate) },
  };
}

function compileThrough(
  expression: { through: string; selection: Expression },
  parent: CriteriaSqlTarget,
  params: SqlParam[],
  depth: number,
  clock: CriteriaClock,
): { sql: string; predicate: Predicate } {
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
  return {
    sql:
      `EXISTS (SELECT 1 FROM ${child.table} WHERE (` +
      `${child.table}.uuid = ${link} OR ${child.table}.uuid IN (SELECT value FROM ${each}))` +
      ` AND (${inner.sql || "1"}))`,
    predicate: {
      op: "exists",
      table: child.table,
      link: expression.through,
      item: inner.predicate,
    },
  };
}

function compileCondition(
  field: string,
  operator: Operator,
  value: Value,
  target: CriteriaSqlTarget,
  params: SqlParam[],
  clock: CriteriaClock,
): { sql: string; predicate: Predicate } {
  const left = fieldRef(field, target);
  const expr = sqlOf(target.table, left);
  if (isFieldValue(value)) {
    const right = fieldRef(value.name, target);
    return {
      sql: compare(expr, operator, sqlOf(target.table, right), params, undefined, true),
      predicate: { op: "cmp", left, operator, right: { field: right } },
    };
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
    return {
      sql: `(${lower.sql} AND ${upper.sql})`,
      predicate: { op: "and", items: [lower.predicate, upper.predicate] },
    };
  }
  const bound = literal(operator, readCriteriaValue(value, clock, field));
  return {
    sql: compare(expr, operator, "?", params, bound, false),
    predicate: { op: "cmp", left, operator, right: { value: bound } },
  };
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

function holds(
  row: SqlDocument,
  predicate: Predicate,
  others: (table: string) => readonly SqlDocument[],
): boolean {
  switch (predicate.op) {
    case "true":
      return true;
    case "false":
      return false;
    case "not":
      return !holds(row, predicate.item, others);
    case "and":
      return predicate.items.every((item) => holds(row, item, others));
    case "or":
      return predicate.items.some((item) => holds(row, item, others));
    case "exists": {
      const ids = linkedIds(row, predicate.link);
      if (ids.length === 0) return false;
      return others(predicate.table).some(
        (child) => ids.includes(child.uuid) && holds(child, predicate.item, others),
      );
    }
    case "cmp":
      return compareValues(
        readField(row, predicate.left),
        predicate.operator,
        "field" in predicate.right
          ? readField(row, predicate.right.field)
          : predicate.right.value,
      );
  }
}

function linkedIds(row: SqlDocument, field: string): string[] {
  const value = readJson(row.data, `$.${field}`);
  if (typeof value === "string") return [value];
  if (Array.isArray(value))
    return value.filter((item): item is string => typeof item === "string");
  return [];
}

function readField(row: SqlDocument, ref: FieldRef): unknown {
  if (ref.kind === "column") {
    if (ref.name === "uuid") return row.uuid;
    if (ref.name === "version") return row.version;
    return row.columns[ref.name] ?? null;
  }
  return readJson(row.data, ref.path);
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

function compareValues(left: unknown, operator: Operator, right: unknown): boolean {
  if (operator === "=" && Array.isArray(right) && right.length === 0) {
    return left == null || (Array.isArray(left) && left.length === 0);
  }
  if (operator === "!=" && Array.isArray(right) && right.length === 0) {
    return left != null && !(Array.isArray(left) && left.length === 0);
  }
  if (operator === "=" && right === null) return left == null;
  if (operator === "!=" && right === null) return left != null;
  switch (operator) {
    case "=":
      return same(left, right);
    case "!=":
      return !same(left, right);
    case ">":
    case ">=":
    case "<":
    case "<=":
      return ordered(left, right, operator);
    case "between": {
      if (!Array.isArray(right) || right.length !== 2) return false;
      return ordered(left, right[0], ">=") && ordered(left, right[1], "<=");
    }
    case "in":
      return Array.isArray(right) && right.some((item) => same(left, item));
    case "not in":
      return Array.isArray(right) && !right.some((item) => same(left, item));
    case "is null":
      return right === 0 || right === false ? left != null : left == null;
    case "like":
      return (
        left != null &&
        String(scalar(left)).toLowerCase().includes(String(right).toLowerCase())
      );
    case "starts with":
      return (
        left != null &&
        String(scalar(left)).toLowerCase().startsWith(String(right).toLowerCase())
      );
    case "contains":
      return quoted(left, String(right));
    case "not contains":
      return left == null || !quoted(left, String(right));
    default:
      return false;
  }
}

function quoted(value: unknown, needle: string): boolean {
  const mark = `"${needle}"`;
  if (typeof value === "string") return value.includes(mark);
  if (value == null) return false;
  return JSON.stringify(value).includes(mark);
}

function same(left: unknown, right: unknown): boolean {
  return scalar(left) === scalar(right);
}

function ordered(left: unknown, right: unknown, operator: "<" | "<=" | ">" | ">="): boolean {
  if (scalar(left) === null || scalar(right) === null) return false;
  const compared = compareUnknown(left, right);
  if (operator === "<") return compared < 0;
  if (operator === "<=") return compared <= 0;
  if (operator === ">") return compared > 0;
  return compared >= 0;
}

function compareRows(
  left: SqlDocument,
  right: SqlDocument,
  order: { ref: FieldRef; descending: boolean }[],
): number {
  for (const item of order) {
    const compared = compareUnknown(readField(left, item.ref), readField(right, item.ref));
    if (compared === 0) continue;
    return item.descending ? -compared : compared;
  }
  return 0;
}

function compareUnknown(left: unknown, right: unknown): number {
  const a = scalar(left);
  const b = scalar(right);
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const as = String(a);
  const bs = String(b);
  if (as < bs) return -1;
  if (as > bs) return 1;
  return 0;
}

function scalar(value: unknown): SqlParam {
  if (value == null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}
