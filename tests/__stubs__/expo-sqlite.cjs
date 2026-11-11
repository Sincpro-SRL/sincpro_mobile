"use strict";
/** expo-sqlite for Node (CommonJS): the TypeScript stub's database, over `node:sqlite`. */
const { DatabaseSync } = require("node:sqlite");

function bound(params) {
  const [first] = params;
  if (
    params.length === 1 &&
    first !== null &&
    typeof first === "object" &&
    !Array.isArray(first)
  ) {
    return [first];
  }
  const flat = params.length === 1 && Array.isArray(first) ? first : params;
  return flat.map((value) => {
    if (value === undefined) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    return value;
  });
}

class SQLiteDatabase {
  constructor() {
    this.db = new DatabaseSync(":memory:");
  }
  execSync(source) {
    this.db.exec(source);
  }
  runSync(source, ...params) {
    const result = this.db.prepare(source).run(...bound(params));
    return {
      lastInsertRowId: Number(result.lastInsertRowid),
      changes: Number(result.changes),
    };
  }
  getFirstSync(source, ...params) {
    return this.db.prepare(source).get(...bound(params)) ?? null;
  }
  getAllSync(source, ...params) {
    return this.db.prepare(source).all(...bound(params));
  }
}

exports.SQLiteDatabase = SQLiteDatabase;
exports.openDatabaseSync = () => new SQLiteDatabase();
exports.openDatabaseAsync = async () => new SQLiteDatabase();
