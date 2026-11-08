import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import ts from "typescript";

const sourceRoot = path.resolve(import.meta.dirname, "../../sincpro_mobile");

function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? tsxFiles(file) : file.endsWith(".tsx") ? [file] : [];
  });
}

test("React Native Pressable never takes className (NativeWind interop re-renders on touch)", () => {
  for (const file of tsxFiles(sourceRoot)) {
    const relative = path.relative(sourceRoot, file);
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const aliases = new Set<string>();
    function inspect(node: ts.Node) {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text === "react-native"
      ) {
        const bindings = node.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const binding of bindings.elements) {
            if ((binding.propertyName?.text ?? binding.name.text) === "Pressable") {
              aliases.add(binding.name.text);
            }
          }
        }
      }
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        aliases.has(node.tagName.getText(source))
      ) {
        const hasClassName = node.attributes.properties.some(
          (attribute) =>
            ts.isJsxAttribute(attribute) && attribute.name.getText(source) === "className",
        );
        assert(
          !hasClassName,
          `${relative}: RN Pressable with className; use @sincpro/mobile-ui/primitives/Pressable`,
        );
      }
      ts.forEachChild(node, inspect);
    }
    inspect(source);
  }
});
