import { DatabaseSync } from "node:sqlite";

import {
  type CompiledCriteria,
  countStatement,
  selectStatement,
} from "../../sincpro_mobile/domain/database/criteria_sql.ts";
import { type SqlStatement } from "../../sincpro_mobile/domain/database/sql.ts";
import {
  type ColumnValue,
  type DocumentRow,
  type DocumentStore,
} from "../../sincpro_mobile/domain/repositories/document_store.ts";

export class FakeDocumentDatabase {
  private tablesByName = new Map<string, Map<string, DocumentRow>>();
  private depth = 0;
  private tail: Promise<void> = Promise.resolve();

  /** Every table and its rows: what a statement reads, put in SQLite for it. */
  tables(): [string, Map<string, DocumentRow>][] {
    return [...this.tablesByName];
  }

  table(name: string): Map<string, DocumentRow> {
    let rows = this.tablesByName.get(name);
    if (!rows) {
      rows = new Map();
      this.tablesByName.set(name, rows);
    }
    return rows;
  }

  inTransaction(): boolean {
    return this.depth > 0;
  }

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.tail;
    this.tail = gate;
    await previous;
    const backup = cloneTables(this.tablesByName);
    this.depth += 1;
    try {
      return await work();
    } catch (error) {
      this.tablesByName = backup;
      throw error;
    } finally {
      this.depth -= 1;
      release();
    }
  }
}

function cloneTables(
  tables: Map<string, Map<string, DocumentRow>>,
): Map<string, Map<string, DocumentRow>> {
  const copy = new Map<string, Map<string, DocumentRow>>();
  for (const [name, rows] of tables) {
    copy.set(name, new Map(rows));
  }
  return copy;
}

function copyRow(row: DocumentRow): DocumentRow {
  return {
    uuid: row.uuid,
    version: row.version,
    data: row.data,
    columns: { ...row.columns },
  };
}

export class FakeDocumentStore implements DocumentStore {
  constructor(
    private readonly database: FakeDocumentDatabase,
    readonly table: string,
    private readonly columnNames: readonly string[] = [],
  ) {}

  async read(uuid: string): Promise<DocumentRow | null> {
    return this.readSync(uuid);
  }

  readSync(uuid: string): DocumentRow | null {
    return this.database.table(this.table).get(uuid) ?? null;
  }

  async insert(row: DocumentRow): Promise<void> {
    const rows = this.database.table(this.table);
    if (rows.has(row.uuid)) {
      throw new Error(`UNIQUE constraint failed: ${this.table}.uuid`);
    }
    rows.set(row.uuid, copyRow(row));
  }

  async update(row: DocumentRow, expectedVersion: number): Promise<boolean> {
    const rows = this.database.table(this.table);
    const current = rows.get(row.uuid);
    if (!current || current.version !== expectedVersion) return false;
    rows.set(row.uuid, copyRow(row));
    return true;
  }

  async upsert(row: DocumentRow): Promise<void> {
    this.database.table(this.table).set(row.uuid, copyRow(row));
  }

  async remove(uuid: string): Promise<void> {
    this.database.table(this.table).delete(uuid);
  }

  async list(): Promise<DocumentRow[]> {
    return [...this.database.table(this.table).values()];
  }

  /**
   * The rows the compiled statement reads, read by SQLite itself: the tables in memory are put in
   * an in-memory database and the very statement the real store runs is run there, so a test
   * reads what the phone would.
   */
  async selectMatching(
    compiled: CompiledCriteria,
    from?: SqlStatement,
  ): Promise<DocumentRow[]> {
    const select = selectStatement(compiled, from ?? this.table, "*");
    return this.run(select).map((row) => ({
      uuid: String(row.uuid),
      version: Number(row.version),
      data: String(row.data),
      columns: Object.fromEntries(
        this.columnNames.map((name) => [name, (row[name] ?? null) as ColumnValue]),
      ),
    }));
  }

  async countMatching(
    compiled: CompiledCriteria,
    ceiling?: number,
    from?: SqlStatement,
  ): Promise<number> {
    const [row] = this.run(countStatement(compiled, from ?? this.table, ceiling));
    return Number(row?.total ?? 0);
  }

  private run(statement: SqlStatement): Record<string, unknown>[] {
    const sqlite = new DatabaseSync(":memory:");
    this.database.table(this.table);
    for (const [name, rows] of this.database.tables()) {
      const extra = [
        ...new Set([
          ...(name === this.table ? this.columnNames : []),
          ...[...rows.values()].flatMap((row) => Object.keys(row.columns)),
        ]),
      ];
      const columns = ["uuid", "version", "data", ...extra];
      sqlite.exec(`CREATE TABLE ${name} (${columns.join(", ")})`);
      const insert = sqlite.prepare(
        `INSERT INTO ${name} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
      );
      for (const row of rows.values()) {
        insert.run(
          row.uuid,
          row.version,
          row.data,
          ...extra.map((one) => row.columns[one] ?? null),
        );
      }
    }
    try {
      return sqlite.prepare(statement.text).all(...statement.params) as Record<
        string,
        unknown
      >[];
    } finally {
      sqlite.close();
    }
  }

  hasColumn(name: string): boolean {
    return this.columnNames.includes(name);
  }

  selectBySync(column: string, value: ColumnValue): DocumentRow[] {
    if (!this.hasColumn(column)) throw new Error(`unknown column: ${column}`);
    return [...this.database.table(this.table).values()].filter(
      (row) => row.columns[column] === value,
    );
  }

  inTransaction(): boolean {
    return this.database.inTransaction();
  }

  transaction<T>(work: () => Promise<T>): Promise<T> {
    return this.database.transaction(work);
  }
}
