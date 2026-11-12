import type { ColorSchemeChoice } from "@sincpro/mobile/domain/settings";
import { resolveOnColor } from "@sincpro/mobile-ui/theme/contrast";

export type { ColorSchemeChoice };
export type ResolvedScheme = "light" | "dark";

/** The part of React Native's `Appearance` the app's color scheme depends on. */
export interface AppearanceLike {
  getColorScheme(): string | null | undefined;
  setColorScheme(scheme: "light" | "dark" | "unspecified"): void;
  addChangeListener(listener: (preferences: { colorScheme?: string | null }) => void): {
    remove(): void;
  };
}

/** Status bar ink over a page color: light icons on dark pages, dark icons on light ones. */
export function statusBarStyleFor(page: string): ResolvedScheme {
  return resolveOnColor(page) === "#FFFFFF" ? "light" : "dark";
}

const toScheme = (value: string | null | undefined): ResolvedScheme =>
  value === "dark" ? "dark" : "light";

/**
 * Keeps the native appearance on the user's choice and paints the matching theme:
 * 1. `choose` overrides the native scheme, so the keyboard, date pickers and alerts take
 *    the app's light or dark instead of the phone's.
 * 2. While the choice is "system", every change of the phone repaints the app.
 * 3. Clearing an override reports the phone's scheme only through that change event
 *    (iOS keeps returning the old override from `getColorScheme` until then), so the
 *    listener stays subscribed for the whole life of the follower.
 * Final: `stop` removes the listener.
 */
export function followColorScheme(
  appearance: AppearanceLike,
  paint: (scheme: ResolvedScheme) => void,
) {
  let choice: ColorSchemeChoice = "system";
  const subscription = appearance.addChangeListener(({ colorScheme }) => {
    if (choice === "system") paint(toScheme(colorScheme));
  });
  return {
    choose(next: ColorSchemeChoice) {
      choice = next;
      appearance.setColorScheme(next === "system" ? "unspecified" : next);
      paint(next === "system" ? toScheme(appearance.getColorScheme()) : next);
    },
    stop: () => subscription.remove(),
  };
}

export type ColorSchemeFollower = ReturnType<typeof followColorScheme>;
