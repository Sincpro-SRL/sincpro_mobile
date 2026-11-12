import { logger } from "@sincpro/client-framework";
import {
  conditionsOf,
  type Criteria,
  type CriteriaFor,
  InvalidCriteria,
  merge,
  type Page,
  plain,
} from "@sincpro/criteria";
import { IDatabaseTable } from "@sincpro/mobile/domain/database";
import { type DocumentCriteria } from "@sincpro/mobile/domain/database/criteria";
import { aliased } from "@sincpro/mobile/domain/database/criteria_sql";
import { type SqlParam } from "@sincpro/mobile/domain/database/sql";
import { identifier, sql } from "@sincpro/mobile/domain/database/sql";
import { EntityCollection } from "@sincpro/mobile/domain/entity";
import { ECommonRepository } from "@sincpro/mobile/domain/repositories";
import { DomainValidationError } from "@sincpro/mobile/exceptions";
import { DBCursor } from "@sincpro/mobile/infrastructure/database";
import { pagedQuery } from "@sincpro/mobile/infrastructure/database/paged_query";
import { tableColumns } from "@sincpro/mobile/infrastructure/database/schema";

/** The column a row of a table viewer is read with: SQLite's own `rowid`, apart from the row's. */
const ROW_ID = "__rowid";

type TableRow = Record<string, SqlParam>;

/** Where a text typed over a table is looked for: its identities and its document, if it has them. */
const SEARCHED_COLUMNS = ["uuid", "id", "remoteId", "remote_id", "name", "data"];

/** The criteria, narrowed to the rows that hold `text` in one of the table's searched columns. */
function holding(criteria: Criteria, text: string, columns: ReadonlySet<string>): Criteria {
  const typed = text.trim();
  if (!typed) return criteria;
  const searched = SEARCHED_COLUMNS.filter((column) => columns.has(column));
  return merge(criteria, {
    selection: {
      any: searched.map((field) => ({ field, operator: "like" as const, value: typed })),
    },
  });
}

function assertColumns(
  criteria: Criteria,
  columns: ReadonlySet<string>,
  table: string,
): void {
  const fields = [
    ...conditionsOf(criteria.selection).map((condition) => condition.field),
    ...(criteria.order ?? []).map((sort) => sort.field),
  ];
  const unknown = fields.find((field) => !columns.has(field));
  if (unknown !== undefined) {
    throw new InvalidCriteria(`${table} has no column '${unknown}'`);
  }
}

class DatabaseTableRepositoryImpl {
  public readonly name = ECommonRepository.DATABASE_TABLE;

  async findAll(): Promise<EntityCollection<any>> {
    logger.debug("Fetching all database tables");
    const result = await DBCursor.getAllAsync<IDatabaseTable>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';`,
    );
    return new EntityCollection((result ?? []) as any);
  }

  /**
   * A page of a table's rows — what the database screen reads, never the whole table:
   * 1. The table is one the database has; its columns are what a criteria may name, and a
   *    `text` is looked for in its identities and its document (`SEARCHED_COLUMNS`).
   * 2. The newest rows first (`rowid`) unless the criteria orders them; fifty unless it says;
   *    past its cursor.
   * Final: the rows as stored, the next page's cursor and the count its `count` asks.
   */
  async page(
    table: string,
    asked: CriteriaFor<TableRow> = {},
    text = "",
  ): Promise<Page<TableRow>> {
    const known = await DBCursor.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      table,
    );
    if (!known) throw new DomainValidationError(`there is no table ${table}`);
    const columns = new Set(await tableColumns(table));
    const written = plain(asked) as Criteria;
    assertColumns(written, columns, table);
    const read = await pagedQuery<TableRow>(
      aliased(
        sql`SELECT rowid AS ${identifier(ROW_ID)}, * FROM ${identifier(table)}`,
        "rows",
      ),
      holding(written, text, columns),
      {
        target: { table: "rows", column: (field) => field === ROW_ID || columns.has(field) },
        order: [{ field: ROW_ID, descending: true }],
        identity: ROW_ID,
      },
    );
    return {
      ...read,
      rows: read.rows.map(({ [ROW_ID]: _rowid, ...row }) => row),
      meta: null,
      dropped: [],
    };
  }

  async save(entity: any | any[] | EntityCollection<any>): Promise<void> {
    throw new Error("Not implemented");
  }

  async remove(entity: any | any[]): Promise<void> {
    throw new Error("Not implemented");
  }

  async findById(id: number | string): Promise<any | null> {
    throw new Error("Not implemented");
  }

  async findByCriteria(_criteria: DocumentCriteria<any>): Promise<EntityCollection<any>> {
    throw new Error("Not implemented");
  }
}

export const DatabaseTableRepository = new DatabaseTableRepositoryImpl();
