import { type DeepPartial, extendTheme, type ThemeTokens } from "@sincpro/mobile-ui/theme";

/**
 * API simple y extensible para que los clientes definan su theme.
 * Parte de los defaults del framework y aplica overrides parciales (tipados).
 *
 *   createApp({
 *     theme: createTheme({ primary: "#FF6600", bg: { page: "#141414" } }),
 *     domains: [...],
 *   });
 *
 * El resultado se inyecta una vez al bootstrap (estático, sin runtime switching)
 * y propaga tanto a `className` (CSS vars) como a `style={theme.x}`.
 */
export function createTheme(overrides?: DeepPartial<ThemeTokens>): ThemeTokens {
  return extendTheme(overrides);
}

export type { DeepPartial, ThemeTokens };
