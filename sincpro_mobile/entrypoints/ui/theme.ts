import { type DeepPartial, extendTheme, type ThemeTokens } from "@sincpro/mobile-ui/theme";

/**
 * Build a fully-typed theme from a partial override object.
 * Starts from the DS base theme and deep-merges your tokens on top.
 *
 *   createAppShell({
 *     theme: createTheme({ primary: "#FF6600", bg: { page: "#F5F5F5" } }),
 *     darkTheme: createTheme({ bg: { page: "#0A0A0A" }, primary: "#F5F5F5" }),
 *     ...
 *   });
 *
 * The result is injected once at bootstrap (static, not swapped at runtime)
 * and propagates as both NativeWind CSS vars (`className`) and inline style props.
 */
export function createTheme(overrides?: DeepPartial<ThemeTokens>): ThemeTokens {
  return extendTheme(overrides);
}

export type { DeepPartial, ThemeTokens };
