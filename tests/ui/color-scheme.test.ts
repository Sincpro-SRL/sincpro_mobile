import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  type AppearanceLike,
  followColorScheme,
  type ResolvedScheme,
  statusBarStyleFor,
} from "@sincpro/mobile/entrypoints/ui/color_scheme";
import { DEFAULT_DARK_THEME } from "@sincpro/mobile-ui/theme/dark";
import { DEFAULT_THEME } from "@sincpro/mobile-ui/theme/default";

/**
 * A phone as React Native sees it: an override applies later, and `getColorScheme` keeps
 * the last reported scheme until the trait change arrives as an event (`settle`).
 */
function phone(initial: ResolvedScheme) {
  let system = initial;
  let override: "light" | "dark" | "unspecified" = "unspecified";
  let reported: ResolvedScheme = initial;
  const listeners = new Set<(preferences: { colorScheme?: string | null }) => void>();
  const appearance: AppearanceLike = {
    getColorScheme: () => reported,
    setColorScheme: (scheme) => {
      override = scheme;
    },
    addChangeListener: (listener) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  };
  return {
    appearance,
    listeners,
    override: () => override,
    switchTo: (next: ResolvedScheme) => {
      system = next;
    },
    settle: () => {
      const next = override === "unspecified" ? system : override;
      if (next === reported) return;
      reported = next;
      for (const listener of listeners) listener({ colorScheme: next });
    },
  };
}

function follow(initial: ResolvedScheme) {
  const device = phone(initial);
  const painted: ResolvedScheme[] = [];
  const follower = followColorScheme(device.appearance, (scheme) => painted.push(scheme));
  return { device, painted, follower };
}

test("dark chosen on a light phone paints dark and takes the native views with it", () => {
  const { device, painted, follower } = follow("light");
  follower.choose("dark");
  assert.deepEqual(painted, ["dark"]);
  assert.equal(device.override(), "dark", "keyboard, date pickers and alerts follow the app");
});

test("a fixed choice ignores the phone's changes", () => {
  const { device, painted, follower } = follow("light");
  follower.choose("dark");
  device.settle();
  device.switchTo("dark");
  device.settle();
  device.switchTo("light");
  device.settle();
  assert.deepEqual(painted, ["dark"]);
});

test("back to system, the app repaints once the phone reports its own scheme", () => {
  // iOS keeps returning the old override from getColorScheme until the trait change
  // arrives; the old provider only listened after a re-render and could stay dark.
  const { device, painted, follower } = follow("light");
  follower.choose("dark");
  device.settle();
  follower.choose("system");
  device.settle();
  assert.equal(device.override(), "unspecified");
  assert.equal(painted.at(-1), "light");
});

test("system follows every change of the phone", () => {
  const { device, painted, follower } = follow("light");
  follower.choose("system");
  device.switchTo("dark");
  device.settle();
  assert.deepEqual(painted, ["light", "dark"]);
});

test("stop removes the listener", () => {
  const { device, follower } = follow("light");
  follower.stop();
  assert.equal(device.listeners.size, 0);
});

test("the status bar ink follows the painted page, not the phone", () => {
  assert.equal(statusBarStyleFor(DEFAULT_THEME.bg.page), "dark");
  assert.equal(statusBarStyleFor(DEFAULT_DARK_THEME.bg.page), "light");
});

test("the AppShell owns the only status bar of the app", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const shell = readFileSync(
    path.join(root, "sincpro_mobile/entrypoints/ui/AppShell.tsx"),
    "utf8",
  );
  assert.match(shell, /<StatusBar style=\{statusBarStyleFor\(activeTheme\.bg\.page\)\} \/>/);
  assert.equal(shell.match(/<StatusBar\b/g)?.length, 1);
});

test("the AppShell paints className colors from useThemeVars, one object per theme", () => {
  // React Compiler memoized vars(themeToVars(activeTheme)) on the theme object, which mobile
  // UI 3.1 mutates in place: switching to dark from settings kept the light variables.
  const root = path.resolve(import.meta.dirname, "../..");
  const shell = readFileSync(
    path.join(root, "sincpro_mobile/entrypoints/ui/AppShell.tsx"),
    "utf8",
  );
  assert.match(shell, /const themeStyle = useThemeVars\(\);/);
  assert.doesNotMatch(shell, /import\s*\{[^}]*\bthemeToVars\b[^}]*\}/);
});
