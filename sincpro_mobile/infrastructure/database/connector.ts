import logger, { loggerRepositories } from "@sincpro/mobile/infrastructure/logger";
import { Mutex } from "async-mutex";
import {
  openDatabaseAsync,
  openDatabaseSync,
  SQLiteDatabase,
  SQLiteRunResult,
  SQLiteVariadicBindParams,
} from "expo-sqlite";

export const DB_NAME = "distribution.db";
let dbInstance: SQLiteDatabase | null = null;
const dbLock = new Mutex();

// Telemetry/queue tables are excluded from query logging: logging their
// mutations would feed the log pipeline its own writes — and a failing
// telemetry insert logs at ERROR (always remote), which tries to insert again,
// amplifying under exactly the offline/full conditions where inserts fail.
const SKIP_LOG_TABLES = [
  "event_queue",
  "dead_letter_queue",
  "telemetry_queue",
  "spans_queue",
];

function shouldLogQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return !SKIP_LOG_TABLES.some((table) => lowerQuery.includes(table));
}

async function initDatabase(): Promise<SQLiteDatabase> {
  logger.info("Initializing database connection...");
  const db = await openDatabaseAsync(DB_NAME);
  await db.execAsync("PRAGMA journal_mode = WAL;");
  await db.execAsync("PRAGMA foreign_keys = ON;");
  return db;
}

export async function getDatabase(): Promise<SQLiteDatabase> {
  if (!dbInstance) {
    dbInstance = await initDatabase();
  }
  return dbInstance;
}

function initDatabaseSync(): SQLiteDatabase {
  logger.info("Initializing database connection (sync)...");
  const db = openDatabaseSync(DB_NAME);
  db.execSync("PRAGMA journal_mode = WAL;");
  db.execSync("PRAGMA foreign_keys = ON;");
  return db;
}

export function getDatabaseSync(): SQLiteDatabase {
  if (!dbInstance) {
    dbInstance = initDatabaseSync();
  }
  return dbInstance;
}

async function withDB<T>(fn: (db: SQLiteDatabase) => Promise<T>): Promise<T> {
  return dbLock.runExclusive(async () => fn(await getDatabase()));
}

function withDBSync<T>(fn: (db: SQLiteDatabase) => T): T {
  return fn(getDatabaseSync());
}

export const DBCursor = {
  async mutateDatabase(
    query: string,
    ...params: SQLiteVariadicBindParams
  ): Promise<SQLiteRunResult> {
    const safeQuery = `${query.trim()};`;
    return withDB(async (db) => {
      try {
        if (shouldLogQuery(safeQuery)) {
          loggerRepositories.info(`Database mutation: ${safeQuery}]`);
        }
        const result = await db.runAsync(safeQuery, ...params);
        if (shouldLogQuery(safeQuery)) {
          loggerRepositories.debug("Database mutation result:", result.lastInsertRowId);
        }
        return result;
      } catch (error) {
        loggerRepositories.error("Database mutation error:", error);
        loggerRepositories.error("SQL:", safeQuery, params);
        throw error;
      }
    });
  },

  async getFirstAsync<T>(
    query: string,
    ...params: SQLiteVariadicBindParams
  ): Promise<T | null> {
    const safeQuery = `${query.trim()};`;
    return withDB(async (db) => {
      try {
        if (shouldLogQuery(safeQuery)) {
          loggerRepositories.info("Database query:", safeQuery, params);
        }
        return await db.getFirstAsync(safeQuery, ...params);
      } catch (error) {
        loggerRepositories.error("Database query error:", error);
        loggerRepositories.error("SQL:", safeQuery, params);
        throw error;
      }
    });
  },

  async getAllAsync<T>(query: string, ...params: SQLiteVariadicBindParams): Promise<T[]> {
    const safeQuery = `${query.trim()};`;
    return withDB(async (db) => {
      try {
        if (shouldLogQuery(safeQuery)) {
          loggerRepositories.info("Database query:", safeQuery, params);
        }
        return await db.getAllAsync(safeQuery, ...params);
      } catch (error) {
        loggerRepositories.error("Database query error:", error);
        loggerRepositories.error("SQL:", safeQuery, params);
        throw error;
      }
    });
  },

  async execAsync(query: string): Promise<void> {
    const safeQuery = `${query.trim()};`;
    return withDB(async (db) => {
      try {
        if (shouldLogQuery(safeQuery)) {
          loggerRepositories.info("Executing database command:", safeQuery);
        }
        await db.execAsync(safeQuery);
      } catch (error) {
        loggerRepositories.error("Database command error:", error);
        loggerRepositories.error("SQL:", safeQuery);
        throw error;
      }
    });
  },

  getFirstSync<T>(query: string, ...params: SQLiteVariadicBindParams): T | null {
    const safeQuery = `${query.trim()};`;
    return withDBSync((db) => {
      try {
        if (shouldLogQuery(safeQuery)) {
          loggerRepositories.debug("Sync database query:", safeQuery);
        }
        return db.getFirstSync(safeQuery, ...params);
      } catch (error) {
        loggerRepositories.error("Sync database query error:", error);
        loggerRepositories.error("SQL:", safeQuery, params);
        throw error;
      }
    });
  },

  getAllSync<T>(query: string, ...params: SQLiteVariadicBindParams): T[] {
    const safeQuery = `${query.trim()};`;
    return withDBSync((db) => {
      try {
        if (shouldLogQuery(safeQuery)) {
          loggerRepositories.debug("Sync database query:", safeQuery);
        }
        return db.getAllSync(safeQuery, ...params);
      } catch (error) {
        loggerRepositories.error("Sync database query error:", error);
        loggerRepositories.error("SQL:", safeQuery, params);
        throw error;
      }
    });
  },

  mutateDatabaseSync(query: string, ...params: SQLiteVariadicBindParams): SQLiteRunResult {
    const safeQuery = `${query.trim()};`;
    return withDBSync((db) => {
      try {
        if (shouldLogQuery(safeQuery)) {
          loggerRepositories.debug("Sync database mutation:", safeQuery);
        }
        const result = db.runSync(safeQuery, ...params);
        if (shouldLogQuery(safeQuery)) {
          loggerRepositories.debug("Sync mutation result:", result.lastInsertRowId);
        }
        return result;
      } catch (error) {
        loggerRepositories.error("Sync database mutation error:", error);
        loggerRepositories.error("SQL:", safeQuery, params);
        throw error;
      }
    });
  },
};
