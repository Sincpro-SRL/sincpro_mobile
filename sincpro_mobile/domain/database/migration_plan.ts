import { type IMigration } from "./database";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface ColumnDefinition {
  name: string;
  definition: string;
}

export function migrationTables(migration: IMigration): string[] {
  const declared = migration.tables ?? [migration.name];
  return declared.filter((name) => IDENTIFIER.test(name));
}

export function pendingMigrations(
  migrations: readonly IMigration[],
  applied: ReadonlySet<string>,
): IMigration[] {
  const seen = new Set(applied);
  const pending: IMigration[] = [];
  for (const migration of migrations) {
    if (seen.has(migration.name)) continue;
    seen.add(migration.name);
    pending.push(migration);
  }
  return pending;
}

export function resetPlan(
  migrations: readonly IMigration[],
  persisted: readonly string[],
): { drop: string[]; forget: string[] } {
  const keep = new Set(persisted);
  const drop = new Set<string>();
  const forget: string[] = [];
  for (const migration of migrations) {
    const tables = migrationTables(migration);
    const removed = tables.filter((table) => !keep.has(table));
    for (const table of removed) drop.add(table);
    if (tables.length > 0 && removed.length === tables.length) forget.push(migration.name);
  }
  return { drop: [...drop], forget };
}

export function missingColumns(
  existing: readonly string[],
  wanted: readonly ColumnDefinition[],
): ColumnDefinition[] {
  const have = new Set(existing);
  return wanted.filter((column) => !have.has(column.name));
}
