import { hasPrinterDriver } from "@sincpro/mobile/domain/print";
import { defineBackgroundCrons } from "@sincpro/mobile/framework/background";
import { createKernel, startApp } from "@sincpro/mobile/framework/createApp";
import type { DomainModule } from "@sincpro/mobile/framework/domain_module";
import type { Kernel } from "@sincpro/mobile/framework/kernel";
import logger from "@sincpro/mobile/infrastructure/logger";
import type { TelemetryConfig } from "@sincpro/mobile/infrastructure/telemetry";
import { printerService } from "@sincpro/mobile/services/printer.service";
import { onceUntilFailure } from "@sincpro/mobile/tools/utils/once";
import { DeviceNotices } from "@sincpro/mobile/ui/activity";
import { type BrandingConfig, setBranding } from "@sincpro/mobile-ui/branding";
import { OverlayHost } from "@sincpro/mobile-ui/Dialog";
import { ICON_FONTS } from "@sincpro/mobile-ui/Display";
import { ErrorBoundary, Feedback, ToastProvider } from "@sincpro/mobile-ui/Feedback";
import KeyboardToolbarHost from "@sincpro/mobile-ui/Form/Form.KeyboardToolbarHost";
import {
  setActiveTheme,
  type ThemeTokens,
  useTheme,
  useThemeVars,
} from "@sincpro/mobile-ui/theme";
import { configureFonts, type FontRole, useFonts } from "@sincpro/mobile-ui/theme/typography";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { type ComponentType, type ReactNode, useEffect, useState } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";

import { statusBarStyleFor } from "./color_scheme";
import { CommonProvider } from "./common_provider";
import { type DomainEntry, DomainSwitcherProvider } from "./domain_switcher";

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
  /** Domain active on launch. Defaults to the first of `domains`. */
  initialDomain?: string;
  /**
   * Called when `useDomainSwitcher().switchTo(key)` changes the domain. The host owns the
   * routes: map the key to one here (`router.replace(...)`) or read `activeDomain`.
   */
  onDomainChange?: (key: string) => void;
  /**
   * Additional React context providers to wrap around the app. Providers are
   * applied in array order, outermost last — i.e. the last element in the
   * array becomes the outermost wrapper and can observe all others.
   *
   * Example: `[ConfirmationProvider, ProcessToastProvider]`
   */
  providers?: ProviderComponent[];
  /**
   * Opt-in log and trace shipping. Omit it and nothing is sent to Loki or OTLP.
   * Started after migrations, so the telemetry tables exist.
   */
  telemetry?: TelemetryConfig;
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

/** What `defineAppShell` prepared while the bundle loaded. Pass it to `<AppShell shell>`. */
export interface AppShellDefinition {
  readonly config: AppShellConfig;
  readonly kernel: Kernel;
  readonly domains: DomainEntry[];
  readonly initialDomain: string;
  readonly fontFiles: Record<string, string | number>;
  /** Starts the data layer, queue, crons and telemetry once; a failed start can retry. */
  readonly start: () => Promise<void>;
}

/**
 * Prepares the app while the bundle loads. Call it at module scope (root layout or
 * App file), never inside a component:
 * - theme, branding and fonts are set before the first render;
 * - the native splash is held until the app is ready;
 * - the kernel is built without IO and background crons are defined, so the OS
 *   finds them when it wakes a closed app.
 */
export function defineAppShell(config: AppShellConfig): AppShellDefinition {
  if (config.theme) setActiveTheme(config.theme);
  if (config.branding) setBranding(config.branding);
  if (config.brandFont?.families) configureFonts(familiesToRoles(config.brandFont.families));
  SplashScreen.preventAutoHideAsync().catch(() => {});

  const kernel = createKernel({ domains: config.domains });
  defineBackgroundCrons(kernel, { telemetry: config.telemetry });
  const domains = config.domains.map(({ key, name }) => ({ key, name }));

  return {
    config,
    kernel,
    domains,
    initialDomain: config.initialDomain ?? domains[0]?.key ?? "",
    // Mobile UI draws Android and web icons from the Material Symbols font; without it every
    // icon is blank. On iOS ICON_FONTS is empty: icons are SF Symbols.
    fontFiles: { ...ICON_FONTS, ...config.brandFont?.files },
    start: onceUntilFailure(async () => {
      await startApp(kernel, { telemetry: config.telemetry });
    }),
  };
}

/** Wraps children in the provider list. reduceRight → first item = innermost wrapper. */
function withProviders(providers: ProviderComponent[], children: ReactNode): ReactNode {
  return providers.reduceRight<ReactNode>(
    (acc, Provider) => <Provider>{acc}</Provider>,
    children,
  );
}

type StartStatus = "starting" | "ready" | "failed";

/** Runs `shell.start()` and exposes its status; `retry` starts it again after a failure. */
function useStart(shell: AppShellDefinition) {
  const [status, setStatus] = useState<StartStatus>("starting");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    shell
      .start()
      .then(() => {
        if (active) setStatus("ready");
      })
      .catch((error: unknown) => {
        logger.error("[AppShell] The app could not start", error);
        if (active) setStatus("failed");
      });
    return () => {
      active = false;
    };
  }, [shell, attempt]);

  const retry = () => {
    setStatus("starting");
    setAttempt((value) => value + 1);
  };
  return { status, retry };
}

/**
 * Root of a Sincpro app: gestures, theme variables, safe area, keyboard, settings,
 * toasts and the host's providers around `children`. The host owns navigation: pass its
 * router (Expo Router `<Stack />`, or a `NavigationContainer`) as `children`.
 *
 * `children` mount only after the data layer is ready, so screens and providers can
 * use repositories from their first render. A failed start shows a retry screen
 * instead of a blank one.
 */
export function AppShell({
  shell,
  children,
}: {
  shell: AppShellDefinition;
  children: ReactNode;
}) {
  const { config } = shell;
  const { status, retry } = useStart(shell);
  const [minDurationMet, setMinDurationMet] = useState(false);
  const [fontsLoaded, fontError] = useFonts(shell.fontFiles);
  const activeTheme = useTheme();
  // One object per theme version. `vars(themeToVars(activeTheme))` was memoized by React
  // Compiler on the theme object, which mobile UI 3.1 mutates in place: a light/dark switch
  // from settings left every className color on the previous theme.
  const themeStyle = useThemeVars();
  const fontsSettled = fontsLoaded || fontError != null;
  const showApp = status === "ready" && fontsSettled && minDurationMet;
  const settled = showApp || status === "failed";

  useEffect(() => {
    const timer = setTimeout(() => setMinDurationMet(true), config.splashDuration ?? 2000);
    return () => clearTimeout(timer);
  }, [config.splashDuration]);

  useEffect(() => {
    if (fontError)
      logger.warn(
        "[AppShell] Fonts failed to load (icons or brand); using system fallbacks",
        fontError,
      );
  }, [fontError]);

  useEffect(() => {
    if (settled) SplashScreen.hideAsync().catch(() => {});
  }, [settled]);

  // A host that prints keeps its saved printer connected: after a restart, a crash, a return
  // to the foreground or a lost link it reconnects by itself instead of waiting for a tap.
  useEffect(() => {
    if (status !== "ready" || !hasPrinterDriver()) return;
    return printerService.keepConnected();
  }, [status]);

  if (!settled) {
    const Splash = config.splashComponent;
    return Splash ? (
      <Splash />
    ) : (
      <View style={{ flex: 1, backgroundColor: activeTheme.bg.page }} />
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* The only status bar controller: it follows the painted theme, not the phone's, so
          dark chosen on a light phone keeps a readable clock. Hosts do not mount another. */}
      <StatusBar style={statusBarStyleFor(activeTheme.bg.page)} />
      <View className="flex-1" style={themeStyle}>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          {status === "failed" ? (
            <View style={{ flex: 1, backgroundColor: activeTheme.bg.page }}>
              <Feedback.Error
                message="No se pudo iniciar la aplicación."
                onRetry={retry}
                testID="app-shell-start-failed"
              />
            </View>
          ) : (
            <KeyboardProvider>
              <CommonProvider darkTheme={config.darkTheme} lightTheme={config.theme}>
                <ToastProvider position="top">
                  {/* The one host every Sheet, Select and dialog draws in (mobile UI 3.1):
                      without it each overlay renders in place, clipped by its container. */}
                  <OverlayHost>
                    <ErrorBoundary
                      onError={(error) => logger.error("[AppShell] Render failed", error)}
                    >
                      {withProviders(
                        config.providers ?? [],
                        <DomainSwitcherProvider
                          domains={shell.domains}
                          initialDomain={shell.initialDomain}
                          onChange={config.onDomainChange}
                        >
                          {children}
                        </DomainSwitcherProvider>,
                      )}
                    </ErrorBoundary>
                  </OverlayHost>
                  <DeviceNotices />
                </ToastProvider>
                {/* The only keyboard toolbar of the app; every KeyboardForm and sheet uses it. */}
                <KeyboardToolbarHost />
              </CommonProvider>
            </KeyboardProvider>
          )}
        </SafeAreaProvider>
      </View>
    </GestureHandlerRootView>
  );
}
