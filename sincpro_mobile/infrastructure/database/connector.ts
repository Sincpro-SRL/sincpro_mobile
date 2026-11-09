import logger, { loggerRepositories } from "@sincpro/mobile/infrastructure/logger";
import { Mutex } from "async-mutex";
import {
  openDatabaseSync,
  SQLiteDatabase,
  SQLiteRunResult,
  SQLiteVariadicBindParams,
} from "expo-sqlite";

/*
 * Every call reaches SQLite through the synchronous native functions, even behind the async API.
 * On iOS, expo-modules-jsi 58 encodes the result of an async expo-sqlite call from a Swift
 * cooperative thread instead of the JavaScript thread: Hermes is touched off its thread, its heap
 * gets corrupted and the app crashes a moment later (seen on logout, when many tables are cleared
 * at once). The sync functions run and encode on the JavaScript thread. The mutex keeps the order
 * of operations. Go back to the async functions once expo/expo#52754 and #51040 are fixed.
 */

export const DB_NAME = "distribution.db";
let dbInstance: SQLiteDatabase | null = null;
let currentTx: SQLiteDatabase | null = null;
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
  return initDatabaseSync();
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
  if (currentTx) return fn(currentTx);
  return dbLock.runExclusive(async () => fn(await getDatabase()));
}

function withDBSync<T>(fn: (db: SQLiteDatabase) => T): T {
  return fn(getDatabaseSync());
}

export const DBCursor = {
  inTransaction(): boolean {
    return currentTx !== null;
  },

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    return dbLock.runExclusive(async () => {
      const db = await getDatabase();
      db.execSync("BEGIN;");
      currentTx = db;
      try {
        const result = await work();
        db.execSync("COMMIT;");
        return result;
      } catch (error) {
        db.execSync("ROLLBACK;");
        throw error;
      } finally {
        currentTx = null;
      }
    });
  },

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
        const result = db.runSync(safeQuery, ...params);
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
        return db.getFirstSync<T>(safeQuery, ...params);
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
        return db.getAllSync<T>(safeQuery, ...params);
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
        db.execSync(safeQuery);
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
