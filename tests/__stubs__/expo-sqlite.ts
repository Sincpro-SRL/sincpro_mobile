/**
 * expo-sqlite for Node: the same synchronous surface the connector uses, over `node:sqlite` in
 * memory — so the SQL of an adapter (an event store, a migration) runs for real in a test. Each
 * test file runs in its own process and opens its own database.
 */
import { DatabaseSync } from "node:sqlite";

type Bound = null | number | bigint | string | Uint8Array;

function bound(params: unknown[]): unknown[] {
  const [first] = params;
  const flat = params.length === 1 && Array.isArray(first) ? first : params;
  if (
    params.length === 1 &&
    first !== null &&
    typeof first === "object" &&
    !Array.isArray(first)
  ) {
    return [first];
  }
  return flat.map((value): Bound => {
    if (value === undefined) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    return value as Bound;
  });
}

export class SQLiteDatabase {
  private readonly db = new DatabaseSync(":memory:");

  execSync(source: string): void {
    this.db.exec(source);
  }

  runSync(
    source: string,
    ...params: unknown[]
  ): { lastInsertRowId: number; changes: number } {
    const result = this.db.prepare(source).run(...(bound(params) as Bound[]));
    return {
      lastInsertRowId: Number(result.lastInsertRowid),
      changes: Number(result.changes),
    };
  }

  getFirstSync<T>(source: string, ...params: unknown[]): T | null {
    return (
      (this.db.prepare(source).get(...(bound(params) as Bound[])) as T | undefined) ?? null
    );
  }

  getAllSync<T>(source: string, ...params: unknown[]): T[] {
    return this.db.prepare(source).all(...(bound(params) as Bound[])) as T[];
  }
}

export function openDatabaseSync(): SQLiteDatabase {
  return new SQLiteDatabase();
}

export async function openDatabaseAsync(): Promise<SQLiteDatabase> {
  return new SQLiteDatabase();
}
