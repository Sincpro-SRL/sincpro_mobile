export class SQLiteDatabase {}

export async function openDatabaseAsync(): Promise<never> {
  throw new Error("[test-stub] expo-sqlite is not available in Node.js");
}

export function openDatabaseSync(): never {
  throw new Error("[test-stub] expo-sqlite is not available in Node.js");
}
