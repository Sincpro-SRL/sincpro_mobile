/**
 * Node.js custom resolve hook — loaded via --import before the test runner.
 *
 * Two responsibilities:
 *   1. Resolve @sincpro/mobile/... path aliases to local source files,
 *      mirroring the tsconfig "paths" configuration.
 *   2. Redirect expo-* native modules to lightweight TypeScript stubs so
 *      domain-layer tests can run in Node.js without the React Native bridge.
 *
 * Loaded via:
 *   node --import ./tests/loader.mjs --experimental-strip-types --test "tests/**"
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const STUBS_DIR = path.join(ROOT, "tests/__stubs__");

/** Modules that have a local stub in tests/__stubs__ */
const STUBBED = new Set(["expo-crypto", "expo-sqlite"]);

/** Modules that should silently resolve to an empty stub (no stub file needed) */
const EMPTY_STUBS = new Set([
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
]);

function resolveAlias(specifier) {
  if (specifier === "@sincpro/mobile") {
    return path.join(ROOT, "sincpro_mobile", "index.ts");
  }
  if (specifier.startsWith("@sincpro/mobile/")) {
    const suffix = specifier.slice("@sincpro/mobile/".length);
    const base = path.join(ROOT, "sincpro_mobile", suffix);
    for (const candidate of [base + ".ts", base + "/index.ts", base + ".tsx"]) {
      if (existsSync(candidate)) return candidate;
    }
    return base;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  // 1. @sincpro/mobile path aliases
  const local = resolveAlias(specifier);
  if (local) {
    return { url: pathToFileURL(local).href, shortCircuit: true };
  }

  // 2. expo modules with dedicated stub files
  if (STUBBED.has(specifier)) {
    const stub = path.join(STUBS_DIR, `${specifier}.ts`);
    return { url: pathToFileURL(stub).href, shortCircuit: true };
  }

  // 3. expo modules that need to import without crashing (empty stub)
  if (EMPTY_STUBS.has(specifier)) {
    // Resolve to the empty stub; a single file serves all of them.
    const stub = path.join(STUBS_DIR, "__empty__.ts");
    return { url: pathToFileURL(stub).href, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}
