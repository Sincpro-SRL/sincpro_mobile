import { DBCursor } from "@sincpro/mobile/infrastructure/database/connector";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DEFINITION = /^[A-Za-z0-9_ ()'",.{}-]+$/;
const LEDGER = "schema_migrations";

export function assertSqlIdentifier(name: string): void {
  if (!IDENTIFIER.test(name)) throw new Error(`invalid SQL identifier: ${name}`);
}

export function addColumnStatement(
  table: string,
  column: string,
  definition: string,
): string {
  assertSqlIdentifier(table);
  assertSqlIdentifier(column);
  if (!DEFINITION.test(definition))
    throw new Error(`invalid column definition: ${definition}`);
  return `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`;
}

export async function tableColumns(table: string): Promise<string[]> {
  assertSqlIdentifier(table);
  const rows = await DBCursor.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.map((row) => row.name);
}

export function tableColumnsSync(table: string): string[] {
  assertSqlIdentifier(table);
  const rows = DBCursor.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.map((row) => row.name);
}

export async function addColumnIfMissing(
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  const existing = await tableColumns(table);
  if (existing.includes(column)) return;
  await DBCursor.execAsync(addColumnStatement(table, column, definition));
}

export function addColumnIfMissingSync(
  table: string,
  column: string,
  definition: string,
): void {
  const existing = tableColumnsSync(table);
  if (existing.includes(column)) return;
  DBCursor.mutateDatabaseSync(addColumnStatement(table, column, definition));
}

export async function appliedMigrationNames(): Promise<Set<string>> {
  await ensureLedger();
  const rows = await DBCursor.getAllAsync<{ name: string }>(`SELECT name FROM ${LEDGER}`);
  return new Set(rows.map((row) => row.name));
}

export async function markMigrationApplied(name: string): Promise<void> {
  await ensureLedger();
  await DBCursor.mutateDatabase(`INSERT OR IGNORE INTO ${LEDGER} (name) VALUES (?)`, name);
}

export async function forgetMigrations(names: readonly string[]): Promise<void> {
  await ensureLedger();
  if (names.length === 0) return;
  const marks = names.map(() => "?").join(", ");
  await DBCursor.mutateDatabase(`DELETE FROM ${LEDGER} WHERE name IN (${marks})`, ...names);
}

async function ensureLedger(): Promise<void> {
  await DBCursor.execAsync(`
    CREATE TABLE IF NOT EXISTS ${LEDGER} (
      name TEXT PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}
