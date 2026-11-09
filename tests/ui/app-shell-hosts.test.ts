import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

test("the AppShell mounts the single overlay host and keyboard toolbar of mobile UI 3.1", () => {
  // Without the OverlayHost every Sheet, Select and dialog renders in place, clipped by the
  // view that declares it (time zone and printer pickers drew inside their card).
  const shell = read("sincpro_mobile/entrypoints/ui/AppShell.tsx");
  assert.match(shell, /<OverlayHost>/);
  assert.equal(shell.match(/<KeyboardToolbarHost\b/g)?.length, 1);
  assert.ok(
    shell.indexOf("<OverlayHost>") < shell.indexOf("{children}"),
    "the app must render inside the overlay host",
  );
});

test("the storybook frame mounts the same hosts as the AppShell", () => {
  const preview = read(".rnstorybook/preview.tsx");
  assert.match(preview, /<OverlayHost>/);
  assert.match(preview, /<KeyboardToolbarHost\b/);
});

test("the AppShell loads the icon font of mobile UI with the brand fonts", () => {
  // Android draws every DS icon from Material Symbols. The shell only loaded the brand
  // files, so on a phone every icon of the app came out blank.
  const shell = read("sincpro_mobile/entrypoints/ui/AppShell.tsx");
  assert.match(shell, /import \{ ICON_FONTS \} from "@sincpro\/mobile-ui\/Display";/);
  assert.match(shell, /fontFiles: \{ \.\.\.ICON_FONTS, \.\.\.config\.brandFont\?\.files \}/);
  assert.match(shell, /useFonts\(shell\.fontFiles\)/);
});
