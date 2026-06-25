export interface IDBCursor {
  mutateDatabase(query: string, ...params: unknown[]): Promise<{ lastInsertRowId: number }>;
  getAllAsync<T>(query: string, ...params: unknown[]): Promise<T[]>;
}

export interface OutboxEntry {
  id: number;
  level: string;
  message: string;
  created_at: string;
}

export class TelemetryQueueRepository {
  private readonly db: IDBCursor;

  constructor(db: IDBCursor) {
    this.db = db;
  }

  async enqueue(level: string, message: string): Promise<void> {
    await this.db.mutateDatabase(
      `INSERT INTO telemetry_queue (level, message) VALUES (?, ?)`,
      level,
      message,
    );
  }

  async findPending(limit = 100): Promise<OutboxEntry[]> {
    return this.db.getAllAsync<OutboxEntry>(
      `SELECT id, level, message, created_at FROM telemetry_queue ORDER BY id ASC LIMIT ?`,
      limit,
    );
  }

  async removeMany(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => "?").join(", ");
    await this.db.mutateDatabase(
      `DELETE FROM telemetry_queue WHERE id IN (${placeholders})`,
      ...ids,
    );
  }

  /** Deletes entries older than `days` days. Called before each flush to bound queue growth. */
  async pruneExpired(days = 7): Promise<void> {
    await this.db.mutateDatabase(
      `DELETE FROM telemetry_queue WHERE created_at < datetime('now', ?)`,
      `-${days} days`,
    );
  }
}
