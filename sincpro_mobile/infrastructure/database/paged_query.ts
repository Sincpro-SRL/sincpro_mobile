import {
  type Count,
  type Criteria,
  type CriteriaFor,
  type Page,
  plain,
  type Sort,
} from "@sincpro/criteria";
import {
  aliased,
  compilePage,
  countCeiling,
  countOf,
  countStatement,
  type CriteriaSqlTarget,
  cursorAfter,
  selectStatement,
} from "@sincpro/mobile/domain/database/criteria_sql";
import type { SqlStatement } from "@sincpro/mobile/domain/database/sql";

import { DBCursor } from "./connector";

/** The rows of one page, the cursor of the next and the count the criteria asked. */
export interface PagedRows<R> {
  rows: R[];
  cursor: string | null;
  count: Count | null;
}

/** What a page is read over: its fields, the order it falls back to and the column that closes it. */
export interface PagedSource {
  target: CriteriaSqlTarget;
  order: readonly Sort[];
  identity: string;
  selected?: string;
}

/**
 * One page of `from` — a table, or a statement `aliased` as the target's table — as the
 * criteria asks: compiled (`compilePage`), one row more than the page read to know whether
 * another follows, the cursor minted from its last row, and the count its `count` asks.
 */
export async function pagedQuery<R extends Record<string, unknown>>(
  from: string | SqlStatement,
  asked: Criteria,
  source: PagedSource,
): Promise<PagedRows<R>> {
  const page = compilePage(asked, source.target, source);
  const select = selectStatement(page.rows, from, source.selected);
  const rows = await DBCursor.getAllAsync<R>(select.text, ...select.params);
  const shown = rows.slice(0, page.limit);
  const last = shown.at(-1);
  let count: Count | null = null;
  if (page.count !== "none") {
    const counting = countStatement(page.filter, from, countCeiling(page.count));
    const total = await DBCursor.getFirstAsync<{ total: number }>(
      counting.text,
      ...counting.params,
    );
    count = countOf(Number(total?.total ?? 0), page.count);
  }
  return {
    rows: shown,
    cursor:
      rows.length > page.limit && page.resumable && last ? cursorAfter(last, page) : null,
    count,
  };
}

/**
 * A page of what a SQL statement answers — a join, a report, a window: whatever a criteria over
 * one entity cannot say — read as any page is: filtered, ordered and paged by the criteria over
 * the statement's own columns, the next page by its cursor (keyset) or by rows (offset), and
 * counted. `identity` is the column that tells two rows apart and closes every order.
 *
 *     const page = await queryPage<Sale>(
 *       sql`SELECT o.uuid, c.vat, json_extract(o.data, '$.total') AS total
 *           FROM orders o JOIN customers c ON c.uuid = json_extract(o.data, '$.customerId')
 *           WHERE c.vat = ${vat}`,
 *       criteria<Sale>().selection(["total", ">", 100]).order("-total").limit(20),
 *       { identity: "uuid" },
 *     );
 *
 * The statement's values are bound (`sql`); the criteria's fields are its columns, checked as
 * SQL names.
 */
export async function queryPage<R extends Record<string, unknown>>(
  statement: SqlStatement,
  asked: CriteriaFor<R> = {},
  options: { identity: string; order?: readonly Sort[] },
): Promise<Page<R>> {
  const read = await pagedQuery<R>(aliased(statement, "query"), plain(asked) as Criteria, {
    target: { table: "query", column: () => true },
    order: options.order ?? [{ field: options.identity, descending: true }],
    identity: options.identity,
  });
  return { ...read, meta: null, dropped: [] };
}
