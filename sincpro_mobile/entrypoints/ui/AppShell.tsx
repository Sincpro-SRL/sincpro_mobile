import {
  DefaultTheme as NavDefaultTheme,
  NavigationContainer,
} from "@react-navigation/native";
import { createApp } from "@sincpro/mobile/framework/createApp";
import type { DomainModule } from "@sincpro/mobile/framework/domain_module";
import { ToastHost } from "@sincpro/mobile/infrastructure/ui/ToastHost";
import { type BrandingConfig, setBranding } from "@sincpro/mobile-ui";
import { ToastProvider } from "@sincpro/mobile-ui/Feedback";
import {
  setActiveTheme,
  type ThemeTokens,
  themeToVars,
  useTheme,
} from "@sincpro/mobile-ui/theme";
import { configureFonts, type FontRole, useFonts } from "@sincpro/mobile-ui/theme/typography";
import * as SplashScreen from "expo-splash-screen";
import { vars } from "nativewind";
import { type ComponentType, type ReactNode, useEffect, useState } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import {
  initialWindowMetrics,
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";

import { CommonProvider } from "./common_provider";
import { ActiveDomainApp, type DomainApp, DomainSwitcherProvider } from "./domain_switcher";

type ProviderComponent = ComponentType<{ children: ReactNode }>;

// ─── Brand font API ──────────────────────────────────────────────────────────
//
// The app declares its typeface using the same 4 semantic slots that the brand
// manual defines. The framework maps them to DS FontRoles internally — the app
// never touches configureFonts or useFonts directly.
//
//   df  — display font  → titles, headings              (Satoshi in SINCPRO)
//   bf  — body font     → body, labels, buttons         (Inter   — DS default)
//   cf  — caption font  → captions, overlines, meta     (Fira Code — DS default)
//   mono — mono font    → numeric data, SKU, amounts    (Fira Code — DS default)
//
// Omitting a family keeps the DS default. Most apps only need to declare `display`.

export interface BrandFontWeights {
  light?: string; // 300  (body)
  regular?: string; // 400
  medium?: string; // 500
  semiBold?: string; // 600  (body) / use bold for display
  bold?: string; // 700  (display) / maps to `title` role
  extraBold?: string; // 800  (body)
  black?: string; // 900  (display) / maps to `titleBlack` role
}

export interface BrandFontFamilies {
  /** df — Display & headings. Brand character font. (Default: Inter) */
  display?: BrandFontWeights;
  /** bf — Body, labels, buttons. Interface text 13–15px. (Default: Inter) */
  body?: BrandFontWeights;
  /** cf — Captions, overlines, metadata. Uppercase + tracking. (Default: Fira Code) */
  caption?: Pick<BrandFontWeights, "regular" | "medium">;
  /** mono — Numeric data, SKU, amounts. Fixed-width. (Default: Fira Code) */
  mono?: Pick<BrandFontWeights, "regular" | "medium">;
}

export interface BrandFontConfig {
  /** Metro asset map: `{ "Satoshi-Bold": require("./assets/fonts/Satoshi-Bold.otf") }` */
  files: Record<string, string | number>;
  /** Semantic font family slots aligned with the brand manual (df / bf / cf / mono). */
  families: BrandFontFamilies;
}

/** Maps the semantic families object to the low-level DS FontRole record. */
function familiesToRoles(families: BrandFontFamilies): Partial<Record<FontRole, string>> {
  const roles: Partial<Record<FontRole, string>> = {};
  const { display, body, caption, mono } = families;

  if (display) {
    if (display.regular) roles.titleRegular = display.regular;
    if (display.medium) roles.titleMedium = display.medium;
    if (display.bold) roles.title = display.bold;
    if (display.black) roles.titleBlack = display.black;
  }

  if (body) {
    if (body.light) roles.light = body.light;
    if (body.regular) roles.regular = body.regular;
    if (body.medium) roles.medium = body.medium;
    if (body.semiBold) roles.semiBold = body.semiBold;
    if (body.extraBold) roles.extraBold = body.extraBold;
  }

  if (caption) {
    if (caption.regular) roles.mono = caption.regular;
    if (caption.medium) roles.monoMedium = caption.medium;
  }

  if (mono) {
    if (mono.regular) roles.mono = mono.regular;
    if (mono.medium) roles.monoMedium = mono.medium;
  }

  return roles;
}

// ─── AppShell ────────────────────────────────────────────────────────────────

export interface AppShellConfig {
  /**
   * Domain modules to bootstrap. Each module registers its own repositories,
   * migrations, subscribers, and cron workers. The built-in `baseModule` is
   * always included automatically — do not pass it here.
   */
  domains: DomainModule[];
  /**
   * Map of domain key → screen component. Domains without a matching entry
   * here are bootstrapped (events, repos, crons) but have no UI — they run
   * silently in the background. Must contain at least `ui[activeDomain]`.
   */
  ui: Record<string, ComponentType>;
  /**
   * Key of the domain whose UI is shown on launch. Must match one of the
   * keys in `domains` AND have a corresponding entry in `ui`.
   */
  activeDomain: string;
  /**
   * Additional React context providers to wrap around the app. Providers are
   * applied in array order, outermost last — i.e. the last element in the
   * array becomes the outermost wrapper and can observe all others.
   *
   * Example: `[ConfirmationProvider, ProcessToastProvider]`
   */
  providers?: ProviderComponent[];
  /** Light theme tokens. Defaults to the DS base theme if omitted. */
  theme?: ThemeTokens;
  /** Dark theme tokens. When provided, the system color-scheme toggle activates it. */
  darkTheme?: ThemeTokens;
  branding?: BrandingConfig;
  /**
   * Brand typeface declared as semantic slots (df / bf / cf / mono).
   * The app owns all font asset files; the framework wires them into DS roles.
   * Omitting a slot keeps the DS default (Inter for body, Fira Code for mono).
   */
  brandFont?: BrandFontConfig;
  /** Component rendered while fonts + domain init complete. */
  splashComponent?: ComponentType;
  /** Minimum time (ms) the splash stays visible. Default 2000. */
  splashDuration?: number;
}

/** Wraps children in the provider list. reduceRight → first item = innermost wrapper. */
function withProviders(providers: ProviderComponent[], children: ReactNode): ReactNode {
  return providers.reduceRight<ReactNode>(
    (acc, Provider) => <Provider>{acc}</Provider>,
    children,
  );
}

export function createAppShell(config: AppShellConfig): ComponentType {
  const apps: DomainApp[] = config.domains
    .filter((module) => Boolean(config.ui[module.key]))
    .map((module) => ({
      key: module.key,
      name: module.name,
      component: config.ui[module.key],
    }));
  const providers = config.providers ?? [];

  if (config.theme) {
    setActiveTheme(config.theme);
  }
  if (config.branding) {
    setBranding(config.branding);
  }
  // Wire brand font roles into the DS before first render.
  if (config.brandFont?.families) {
    configureFonts(familiesToRoles(config.brandFont.families));
  }

  return function AppShell() {
    const [isReady, setIsReady] = useState(false);
    const [minDurationMet, setMinDurationMet] = useState(false);
    const [brandFontsLoaded] = useFonts(config.brandFont?.files ?? {});
    const activeTheme = useTheme();
    const themeStyle = vars(themeToVars(activeTheme));
    const navTheme = {
      ...NavDefaultTheme,
      colors: { ...NavDefaultTheme.colors, background: activeTheme.bg.page },
    };

    useEffect(() => {
      let active = true;
      createApp({ domains: config.domains }).then(() => {
        if (active) setIsReady(true);
      });
      return () => {
        active = false;
      };
    }, []);

    useEffect(() => {
      SplashScreen.preventAutoHideAsync().catch(() => {});
    }, []);

    useEffect(() => {
      const t = setTimeout(() => setMinDurationMet(true), config.splashDuration ?? 2000);
      return () => clearTimeout(t);
    }, []);

    useEffect(() => {
      if (brandFontsLoaded && isReady && minDurationMet) {
        SplashScreen.hideAsync().catch(() => {});
      }
    }, [brandFontsLoaded, isReady, minDurationMet]);

    if (!isReady || !brandFontsLoaded || !minDurationMet) {
      const Splash = config.splashComponent;
      return Splash ? (
        <Splash />
      ) : (
        <View style={{ flex: 1, backgroundColor: activeTheme.bg.page }} />
      );
    }

    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1" style={themeStyle}>
          <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
              <KeyboardProvider>
                <CommonProvider darkTheme={config.darkTheme} lightTheme={config.theme}>
                  <ToastProvider position="top">
                    {withProviders(
                      providers,
                      <DomainSwitcherProvider apps={apps} initialDomain={config.activeDomain}>
                        <NavigationContainer theme={navTheme}>
                          <ActiveDomainApp />
                        </NavigationContainer>
                      </DomainSwitcherProvider>,
                    )}
                    <ToastHost />
                  </ToastProvider>
                </CommonProvider>
              </KeyboardProvider>
            </SafeAreaView>
          </SafeAreaProvider>
        </View>
      </GestureHandlerRootView>
    );
  };
}
