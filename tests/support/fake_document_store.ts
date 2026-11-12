import {
  type CompiledCriteria,
  rowsFor,
} from "../../sincpro_mobile/domain/database/criteria_sql.ts";
import {
  type ColumnValue,
  type DocumentRow,
  type DocumentStore,
} from "../../sincpro_mobile/domain/repositories/document_store.ts";

export class FakeDocumentDatabase {
  private tables = new Map<string, Map<string, DocumentRow>>();
  private depth = 0;
  private tail: Promise<void> = Promise.resolve();

  table(name: string): Map<string, DocumentRow> {
    let rows = this.tables.get(name);
    if (!rows) {
      rows = new Map();
      this.tables.set(name, rows);
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
    const backup = cloneTables(this.tables);
    this.depth += 1;
    try {
      return await work();
    } catch (error) {
      this.tables = backup;
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

  async selectMatching(compiled: CompiledCriteria): Promise<DocumentRow[]> {
    return rowsFor(compiled, [...this.database.table(this.table).values()], (name) => [
      ...this.database.table(name).values(),
    ]);
  }

  async countMatching(compiled: CompiledCriteria, ceiling?: number): Promise<number> {
    const matched = await this.selectMatching({ ...compiled, limit: undefined, offset: 0 });
    return ceiling === undefined ? matched.length : Math.min(matched.length, ceiling);
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
