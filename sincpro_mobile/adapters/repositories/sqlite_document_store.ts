import { type CompiledCriteria } from "@sincpro/mobile/domain/database/criteria_sql";
import {
  type ColumnDefinition,
  missingColumns,
} from "@sincpro/mobile/domain/database/migration_plan";
import {
  type ColumnValue,
  type DocumentRow,
  type DocumentStore,
} from "@sincpro/mobile/domain/repositories/document_store";
import { DBCursor } from "@sincpro/mobile/infrastructure/database";
import {
  addColumnStatement,
  tableColumns,
  tableColumnsSync,
} from "@sincpro/mobile/infrastructure/database/schema";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export class SqliteDocumentStore implements DocumentStore {
  private readonly integerColumns: ReadonlySet<string>;
  private ready: Promise<void> | null = null;
  private syncReady = false;

  constructor(
    readonly table: string,
    private readonly columnNames: readonly string[] = [],
    integerColumns: readonly string[] = [],
  ) {
    assertIdentifier(table);
    for (const name of columnNames) assertIdentifier(name);
    this.integerColumns = new Set(integerColumns);
  }

  async read(uuid: string): Promise<DocumentRow | null> {
    await this.ensure();
    const row = await DBCursor.getFirstAsync<Record<string, ColumnValue>>(
      `SELECT ${this.selected()} FROM ${this.table} WHERE uuid = ?`,
      uuid,
    );
    return row ? toDocument(row, this.columnNames) : null;
  }

  readSync(uuid: string): DocumentRow | null {
    this.ensureSync();
    const row = DBCursor.getFirstSync<Record<string, ColumnValue>>(
      `SELECT ${this.selected()} FROM ${this.table} WHERE uuid = ?`,
      uuid,
    );
    return row ? toDocument(row, this.columnNames) : null;
  }

  async insert(row: DocumentRow): Promise<void> {
    await this.ensure();
    const names = this.names();
    await DBCursor.mutateDatabase(
      `INSERT INTO ${this.table} (${names.join(", ")}) VALUES (${placeholders(names.length)})`,
      ...this.values(row),
    );
  }

  async update(row: DocumentRow, expectedVersion: number): Promise<boolean> {
    await this.ensure();
    const assignments = ["version", "data", ...this.columnNames]
      .map((name) => `${name} = ?`)
      .join(", ");
    const result = await DBCursor.mutateDatabase(
      `UPDATE ${this.table} SET ${assignments} WHERE uuid = ? AND version = ?`,
      row.version,
      row.data,
      ...this.columnNames.map((name) => row.columns[name] ?? null),
      row.uuid,
      expectedVersion,
    );
    return result.changes === 1;
  }

  async upsert(row: DocumentRow): Promise<void> {
    await this.ensure();
    const names = this.names();
    const assignments = ["version", "data", ...this.columnNames]
      .map((name) => `${name} = excluded.${name}`)
      .join(", ");
    await DBCursor.mutateDatabase(
      `INSERT INTO ${this.table} (${names.join(", ")}) VALUES (${placeholders(names.length)}) ON CONFLICT(uuid) DO UPDATE SET ${assignments}`,
      ...this.values(row),
    );
  }

  async remove(uuid: string): Promise<void> {
    await this.ensure();
    await DBCursor.mutateDatabase(`DELETE FROM ${this.table} WHERE uuid = ?`, uuid);
  }

  async list(): Promise<DocumentRow[]> {
    await this.ensure();
    const rows = await DBCursor.getAllAsync<Record<string, ColumnValue>>(
      `SELECT ${this.selected()} FROM ${this.table}`,
    );
    return rows.map((row) => toDocument(row, this.columnNames));
  }

  async selectMatching(compiled: CompiledCriteria): Promise<DocumentRow[]> {
    await this.ensure();
    const params: ColumnValue[] = [...compiled.params];
    let sql = `SELECT ${this.selected()} FROM ${this.table}`;
    if (compiled.whereSql) sql += ` WHERE ${compiled.whereSql}`;
    if (compiled.orderSql) sql += ` ORDER BY ${compiled.orderSql}`;
    if (compiled.limit !== undefined) {
      sql += " LIMIT ?";
      params.push(compiled.limit);
    } else if (compiled.offset > 0) {
      sql += " LIMIT -1";
    }
    if (compiled.offset > 0) {
      sql += " OFFSET ?";
      params.push(compiled.offset);
    }
    const rows = await DBCursor.getAllAsync<Record<string, ColumnValue>>(sql, ...params);
    return rows.map((row) => toDocument(row, this.columnNames));
  }

  hasColumn(name: string): boolean {
    return this.columnNames.includes(name);
  }

  async selectBy(column: string, value: ColumnValue): Promise<DocumentRow[]> {
    this.assertColumn(column);
    await this.ensure();
    const rows = await DBCursor.getAllAsync<Record<string, ColumnValue>>(
      `SELECT ${this.selected()} FROM ${this.table} WHERE ${column} = ?`,
      value,
    );
    return rows.map((row) => toDocument(row, this.columnNames));
  }

  selectBySync(column: string, value: ColumnValue): DocumentRow[] {
    this.assertColumn(column);
    this.ensureSync();
    const rows = DBCursor.getAllSync<Record<string, ColumnValue>>(
      `SELECT ${this.selected()} FROM ${this.table} WHERE ${column} = ?`,
      value,
    );
    return rows.map((row) => toDocument(row, this.columnNames));
  }

  inTransaction(): boolean {
    return DBCursor.inTransaction();
  }

  transaction<T>(work: () => Promise<T>): Promise<T> {
    return DBCursor.transaction(work);
  }

  private names(): string[] {
    return ["uuid", "version", "data", ...this.columnNames];
  }

  private selected(): string {
    return this.names().join(", ");
  }

  private values(row: DocumentRow): ColumnValue[] {
    return [
      row.uuid,
      row.version,
      row.data,
      ...this.columnNames.map((name) => row.columns[name] ?? null),
    ];
  }

  private definition(): string {
    const extras = this.columnNames
      .map((name) => `${name} ${this.columnDefinition(name)}`)
      .join(", ");
    const tail = extras ? `, ${extras}` : "";
    return `CREATE TABLE IF NOT EXISTS ${this.table} (uuid TEXT PRIMARY KEY NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL${tail})`;
  }

  private columnDefinition(name: string): string {
    if (name === "ackedVersion") return "INTEGER NOT NULL DEFAULT 0";
    return this.integerColumns.has(name) ? "INTEGER" : "TEXT";
  }

  private ensure(): Promise<void> {
    if (!this.ready) {
      this.ready = this.create().catch((error) => {
        this.ready = null;
        throw error;
      });
    }
    return this.ready;
  }

  private wanted(): ColumnDefinition[] {
    return [
      { name: "version", definition: "INTEGER NOT NULL DEFAULT 1" },
      { name: "data", definition: "TEXT NOT NULL DEFAULT '{}'" },
      ...this.columnNames.map((name) => ({
        name,
        definition: this.columnDefinition(name),
      })),
    ];
  }

  private async create(): Promise<void> {
    const existing = await tableColumns(this.table);
    if (existing.length === 0) {
      await DBCursor.execAsync(this.definition());
    } else {
      for (const column of missingColumns(existing, this.wanted())) {
        await DBCursor.execAsync(
          addColumnStatement(this.table, column.name, column.definition),
        );
      }
    }
    for (const name of this.columnNames) {
      await DBCursor.execAsync(
        `CREATE INDEX IF NOT EXISTS idx_${this.table}_${name} ON ${this.table} (${name})`,
      );
    }
  }

  private ensureSync(): void {
    if (this.syncReady) return;
    const existing = tableColumnsSync(this.table);
    if (existing.length === 0) {
      DBCursor.mutateDatabaseSync(this.definition());
    } else {
      for (const column of missingColumns(existing, this.wanted())) {
        DBCursor.mutateDatabaseSync(
          addColumnStatement(this.table, column.name, column.definition),
        );
      }
    }
    for (const name of this.columnNames) {
      DBCursor.mutateDatabaseSync(
        `CREATE INDEX IF NOT EXISTS idx_${this.table}_${name} ON ${this.table} (${name})`,
      );
    }
    this.syncReady = true;
  }

  private assertColumn(name: string): void {
    if (!this.hasColumn(name)) throw new Error(`unknown column: ${name}`);
  }
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function toDocument(
  row: Record<string, ColumnValue>,
  columnNames: readonly string[],
): DocumentRow {
  const columns: Record<string, ColumnValue> = {};
  for (const name of columnNames) columns[name] = row[name] ?? null;
  return {
    uuid: String(row.uuid),
    version: Number(row.version),
    data: String(row.data),
    columns,
  };
}

function assertIdentifier(name: string): void {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`invalid SQL identifier: ${name}`);
  }
}
