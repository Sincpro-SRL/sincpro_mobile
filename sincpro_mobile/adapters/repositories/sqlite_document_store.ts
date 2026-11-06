import {
  type ColumnValue,
  type DocumentRow,
  type DocumentStore,
} from "@sincpro/mobile/domain/repositories/document_store";
import { DBCursor } from "@sincpro/mobile/infrastructure/database";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export class SqliteDocumentStore implements DocumentStore {
  constructor(
    private readonly table: string,
    private readonly columnNames: readonly string[] = [],
  ) {
    assertIdentifier(table);
    for (const name of columnNames) assertIdentifier(name);
  }

  async read(uuid: string): Promise<DocumentRow | null> {
    const selected = ["uuid", "data", ...this.columnNames].join(", ");
    const row = await DBCursor.getFirstAsync<Record<string, ColumnValue>>(
      `SELECT ${selected} FROM ${this.table} WHERE uuid = ?`,
      uuid,
    );
    return row ? toDocument(row, this.columnNames) : null;
  }

  async write(row: DocumentRow): Promise<void> {
    const names = ["uuid", "data", ...this.columnNames];
    const placeholders = names.map(() => "?").join(", ");
    const values = [
      row.uuid,
      row.data,
      ...this.columnNames.map((name) => row.columns[name] ?? null),
    ];
    await DBCursor.mutateDatabase(
      `INSERT OR REPLACE INTO ${this.table} (${names.join(", ")}) VALUES (${placeholders})`,
      ...values,
    );
  }

  async remove(uuid: string): Promise<void> {
    await DBCursor.mutateDatabase(`DELETE FROM ${this.table} WHERE uuid = ?`, uuid);
  }

  async list(): Promise<DocumentRow[]> {
    const selected = ["uuid", "data", ...this.columnNames].join(", ");
    const rows = await DBCursor.getAllAsync<Record<string, ColumnValue>>(
      `SELECT ${selected} FROM ${this.table}`,
    );
    return rows.map((row) => toDocument(row, this.columnNames));
  }

  transaction<T>(work: () => Promise<T>): Promise<T> {
    return DBCursor.transaction(work);
  }
}

function toDocument(
  row: Record<string, ColumnValue>,
  columnNames: readonly string[],
): DocumentRow {
  const columns: Record<string, ColumnValue> = {};
  for (const name of columnNames) columns[name] = row[name] ?? null;
  return { uuid: String(row.uuid), data: String(row.data), columns };
}

function assertIdentifier(name: string): void {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`invalid SQL identifier: ${name}`);
  }
}
