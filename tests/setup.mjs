/**
 * Test bootstrap — loaded before any test file via --import.
 *
 * Registers lightweight stubs for React Native / Expo native modules that
 * cannot run in Node.js (no native bridge). mock.module() intercepts all
 * subsequent imports of these specifiers across the entire test run.
 */
import { randomBytes } from "node:crypto";
import { mock } from "node:test";

// expo-crypto: used by generateUUID (database/utils.ts → uuidv7 + getRandomBytes)
mock.module("expo-crypto", {
  namedExports: {
    getRandomBytes: (n) => randomBytes(n),
    randomUUID: () => crypto.randomUUID(),
    digestStringAsync: async () => "",
    CryptoDigestAlgorithm: { SHA256: "SHA256", SHA1: "SHA1", MD5: "MD5" },
  },
});

// expo-sqlite: used by connector.ts — tests that trigger DB calls will get a
// clear error rather than a silent crash.
mock.module("expo-sqlite", {
  namedExports: {
    openDatabaseAsync: async () => {
      throw new Error("[test-stub] expo-sqlite not available in Node.js");
    },
    openDatabaseSync: () => {
      throw new Error("[test-stub] expo-sqlite not available in Node.js");
    },
    SQLiteDatabase: class {},
  },
});

// expo-network, expo-localization, expo-linking, expo-location, expo-file-system
// — imported transitively; stub them so module resolution succeeds.
for (const pkg of [
  "expo-network",
  "expo-localization",
  "expo-linking",
  "expo-location",
  "expo-file-system",
  "expo-splash-screen",
  "expo-task-manager",
  "expo-background-task",
  "expo-clipboard",
  "expo-sharing",
  "expo-print",
  "react-native",
]) {
  mock.module(pkg, { namedExports: {}, defaultExport: {} });
}
