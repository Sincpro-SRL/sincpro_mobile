import { ECommonRepository } from "../../domain/repository";
import { DATABASE_TABLES } from "../../entrypoints/db/migrations";
import { DBCursor } from "../../infrastructure/database";

class SettingsRepositoryImpl {
  public readonly name = ECommonRepository.SETTINGS;
  public readonly table = DATABASE_TABLES.SETTINGS;
  async saveOneSetting(name: string, value: any): Promise<void> {
    const type = typeof value;
    await DBCursor.mutateDatabase(
      `INSERT OR REPLACE INTO ${DATABASE_TABLES.SETTINGS} (name, value, type)
       VALUES (?, ?, ?)`,
      name,
      JSON.stringify(value),
      type,
    );
  }

  async getSettingByName(name: string): Promise<any | null> {
    const row = await DBCursor.getFirstAsync<{ value: string; type: string }>(
      `SELECT value, type
       FROM ${DATABASE_TABLES.SETTINGS}
       WHERE name = ?`,
      name,
    );

    if (!row) {
      return null;
    }
    return JSON.parse(row.value);
  }
}

export const SettingsRepository = new SettingsRepositoryImpl();
