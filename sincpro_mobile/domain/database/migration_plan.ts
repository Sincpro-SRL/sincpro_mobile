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

export function migrationsNewerThanApp(
  applied: Iterable<string>,
  known: readonly string[],
): string[] {
  const names = new Set(known);
  return [...applied].filter((name) => !names.has(name)).sort();
}

export async function applyMigrationStep(
  migration: IMigration,
  transaction: (work: () => Promise<void>) => Promise<void>,
  mark: (name: string) => Promise<void>,
): Promise<void> {
  await transaction(async () => {
    await migration.migrationFn();
    await mark(migration.name);
  });
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

const LEGACY_REMOTE_COLUMNS: Record<string, string> = {
  remoteId: "remote_id",
  remoteState: "remote_state",
};

export function legacyDocumentColumns(
  table: string,
  existing: readonly string[],
  wanted: readonly string[],
): string | null {
  const have = new Set(existing);
  for (const name of wanted) {
    const legacy = LEGACY_REMOTE_COLUMNS[name];
    if (!legacy || !have.has(legacy) || have.has(name)) continue;
    return `${table} has ${legacy} and no ${name}. Copy ${legacy} into ${name} in a named migration before opening this store.`;
  }
  return null;
}

export function missingColumns(
  existing: readonly string[],
  wanted: readonly ColumnDefinition[],
): ColumnDefinition[] {
  const have = new Set(existing);
  return wanted.filter((column) => !have.has(column.name));
}
