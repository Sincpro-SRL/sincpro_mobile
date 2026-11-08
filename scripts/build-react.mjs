// Re-emits the React layer of dist with React Compiler. tsc already emitted
// every file (decorators included); only UI folders, which use no decorators,
// are compiled again from source so apps get memoized components.
import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { transformFileAsync } from "@babel/core";

const root = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(root, "sincpro_mobile");
const outRoot = path.join(root, "dist");
const REACT_LAYERS = ["ui", "entrypoints/ui"];

const stats = { files: 0, compiled: 0, skipped: [] };
const logger = {
  logEvent(filename, event) {
    if (event.kind === "CompileSuccess") stats.compiled += 1;
    if (event.kind === "CompileError" || event.kind === "CompileSkip") {
      const reason = event.detail?.reason ?? event.reason ?? event.kind;
      stats.skipped.push(`${path.relative(root, filename)}: ${reason}`);
    }
  },
};

function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sources(file);
    if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith(".d.ts")) return [];
    return [file];
  });
}

for (const layer of REACT_LAYERS) {
  for (const file of sources(path.join(sourceRoot, layer))) {
    const result = await transformFileAsync(file, {
      babelrc: false,
      configFile: false,
      sourceMaps: false,
      presets: [["@babel/preset-typescript", { isTSX: true, allExtensions: true }]],
      plugins: [
        ["babel-plugin-react-compiler", { target: "19", logger }],
        [
          "@babel/plugin-transform-react-jsx",
          { runtime: "automatic", importSource: "nativewind" },
        ],
      ],
    });
    const target = path
      .join(outRoot, path.relative(sourceRoot, file))
      .replace(/\.tsx?$/, ".js");
    writeFileSync(target, `${result.code}\n`);
    stats.files += 1;
  }
}

console.log(
  `✓ React layer: ${stats.files} files, React Compiler memoized ${stats.compiled} functions, skipped ${stats.skipped.length}`,
);
for (const line of stats.skipped) console.log(`  · skipped ${line}`);
// A skipped component ships without automatic memoization. Fail instead of
// degrading in silence (try/finally → tools/utils/async withCleanup).
if (stats.skipped.length > 0) {
  console.error("✗ React Compiler must compile every component (see docs/GOTCHAS.md)");
  process.exit(1);
}
