"use strict";
exports.SQLiteDatabase = class {};
exports.openDatabaseAsync = async () => {
  throw new Error("[test-stub] expo-sqlite unavailable");
};
exports.openDatabaseSync = () => {
  throw new Error("[test-stub] expo-sqlite unavailable");
};
