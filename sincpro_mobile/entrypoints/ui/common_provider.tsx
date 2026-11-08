import { GeoAdapter } from "@sincpro/mobile/adapters/Geo.adapter";
import { SettingsRepository } from "@sincpro/mobile/adapters/repositories/setting.repository";
import { Debug } from "@sincpro/mobile/infrastructure/debug";
import logger, {
  EApplicationLogger,
  getEnabledLoggers,
} from "@sincpro/mobile/infrastructure/logger";
import { withCleanup } from "@sincpro/mobile/tools/utils/async";
import type { ThemeTokens } from "@sincpro/mobile-ui/theme";
import { DEFAULT_DARK_THEME, DEFAULT_THEME, setActiveTheme } from "@sincpro/mobile-ui/theme";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Appearance, AppState } from "react-native";

export interface TimezoneLocale {
  timezone: string;
  locale: string;
}

const TIMEZONE_SETTING_KEY = "app.timezone";
const LOCALE_SETTING_KEY = "app.locale";
const COLOR_SCHEME_SETTING_KEY = "app.color_scheme";

interface ICommonContext {
  debugMode: boolean;
  debugModeLoaded: boolean;
  toggleDebugMode: () => Promise<void>;
  /** Which application loggers may emit INFO while debug mode is on. */
  loggerContexts: Record<EApplicationLogger, boolean>;
  setLoggerContextEnabled: (context: EApplicationLogger, enabled: boolean) => Promise<void>;
  resetLoggerContexts: () => Promise<void>;
  hasGeoPermission: boolean;
  geoIsLoading: boolean;
  geoError: string | null;
  checkGeoPermission: () => Promise<void>;
  requestGeoPermission: () => Promise<boolean>;
  locale: string | null;
  timezone: string | null;
  updateTimezone: (tz: TimezoneLocale) => Promise<void>;
  colorScheme: "light" | "dark" | "system";
  setColorScheme: (scheme: "light" | "dark" | "system") => Promise<void>;
}

const CommonContext = createContext<ICommonContext | null>(null);

interface CommonProviderProps {
  children: ReactNode;
  lightTheme?: ThemeTokens;
  darkTheme?: ThemeTokens;
}

export function CommonProvider({ children, lightTheme, darkTheme }: CommonProviderProps) {
  const [debugMode, setDebugMode] = useState(false);
  const [debugModeLoaded, setDebugModeLoaded] = useState(false);
  const [loggerContexts, setLoggerContexts] = useState(getEnabledLoggers);

  const [hasGeoPermission, setHasGeoPermission] = useState(false);
  const [geoIsLoading, setGeoIsLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [locale, setLocale] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [colorScheme, setColorSchemeState] = useState<"light" | "dark" | "system">("system");

  useEffect(() => {
    async function loadDebug() {
      const snapshot = await Debug.hydrate();
      setDebugMode(snapshot.enabled);
      setLoggerContexts(snapshot.loggers);
      setDebugModeLoaded(true);
    }
    loadDebug();
    return Debug.subscribe(() => {
      setDebugMode(Debug.isEnabled());
      setLoggerContexts(Debug.loggers.get());
    });
  }, []);

  const toggleDebugMode = useCallback(async () => {
    await Debug.setEnabledPersist(!debugMode);
  }, [debugMode]);

  const setLoggerContextEnabled = useCallback(
    async (context: EApplicationLogger, enabled: boolean) => {
      await Debug.loggers.setEnabledPersist(context, enabled);
    },
    [],
  );

  const resetLoggerContexts = useCallback(async () => {
    await Debug.loggers.resetPersist();
  }, []);

  const checkGeoPermission = useCallback(async () => {
    setGeoIsLoading(true);
    setGeoError(null);
    return withCleanup(
      async () => {
        try {
          const granted = await GeoAdapter.hasPermission();
          setHasGeoPermission(granted);
        } catch (error) {
          setGeoError((error as Error).message);
          setHasGeoPermission(false);
        }
      },
      () => setGeoIsLoading(false),
    );
  }, []);

  const requestGeoPermission = useCallback(async () => {
    setGeoIsLoading(true);
    setGeoError(null);
    return withCleanup(
      async () => {
        try {
          const granted = await GeoAdapter.requestPermission();
          setHasGeoPermission(granted);
          return granted;
        } catch (error) {
          setGeoError((error as Error).message);
          setHasGeoPermission(false);
          return false;
        }
      },
      () => setGeoIsLoading(false),
    );
  }, []);

  const updateTimezone = useCallback(async (tz: TimezoneLocale) => {
    try {
      await SettingsRepository.saveOneSetting(TIMEZONE_SETTING_KEY, tz.timezone);
      await SettingsRepository.saveOneSetting(LOCALE_SETTING_KEY, tz.locale);
      setTimezone(tz.timezone);
      setLocale(tz.locale);
    } catch (error) {
      logger.warn(error);
    }
  }, []);

  const applyTheme = useCallback(
    (scheme: "light" | "dark" | "system") => {
      const resolved =
        scheme === "system" ? (Appearance.getColorScheme() ?? "light") : scheme;
      setActiveTheme(
        resolved === "dark"
          ? (darkTheme ?? DEFAULT_DARK_THEME)
          : (lightTheme ?? DEFAULT_THEME),
      );
    },
    [lightTheme, darkTheme],
  );

  const setColorScheme = useCallback(
    async (scheme: "light" | "dark" | "system") => {
      await SettingsRepository.saveOneSetting(COLOR_SCHEME_SETTING_KEY, scheme);
      setColorSchemeState(scheme);
      applyTheme(scheme);
    },
    [applyTheme],
  );

  // Returning to the foreground re-reads the permission quietly: no loading
  // flag, and React skips the update when the value did not change, so the
  // whole tree under this provider does not re-render on every resume.
  useEffect(() => {
    Promise.resolve().then(() => checkGeoPermission());
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      GeoAdapter.hasPermission().then(setHasGeoPermission, (error: unknown) =>
        logger.warn("Failed to refresh location permission", error),
      );
    });
    return () => sub.remove();
  }, [checkGeoPermission]);

  // Load persisted color scheme on mount
  useEffect(() => {
    async function loadColorScheme() {
      const saved = await SettingsRepository.getSettingByName(COLOR_SCHEME_SETTING_KEY);
      const scheme =
        saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
      setColorSchemeState(scheme);
      applyTheme(scheme);
    }
    loadColorScheme();
  }, [applyTheme]);

  // Follow system changes when scheme is "system"
  useEffect(() => {
    if (colorScheme !== "system") return;
    const sub = Appearance.addChangeListener(() => applyTheme("system"));
    return () => sub.remove();
  }, [colorScheme, applyTheme]);

  useEffect(() => {
    async function loadTimezoneAndLocale() {
      try {
        const [timezoneResult, localeResult] = await Promise.all([
          SettingsRepository.getSettingByName(TIMEZONE_SETTING_KEY),
          SettingsRepository.getSettingByName(LOCALE_SETTING_KEY),
        ]);
        setTimezone(timezoneResult);
        setLocale(localeResult);
      } catch (error) {
        logger.warn("Failed to load timezone/locale", error);
      }
    }
    loadTimezoneAndLocale();
  }, []);

  const value = useMemo<ICommonContext>(
    () => ({
      debugMode,
      debugModeLoaded,
      toggleDebugMode,
      loggerContexts,
      setLoggerContextEnabled,
      resetLoggerContexts,
      hasGeoPermission,
      geoIsLoading,
      geoError,
      checkGeoPermission,
      requestGeoPermission,
      locale,
      timezone,
      updateTimezone,
      colorScheme,
      setColorScheme,
    }),
    [
      debugMode,
      debugModeLoaded,
      toggleDebugMode,
      loggerContexts,
      setLoggerContextEnabled,
      resetLoggerContexts,
      hasGeoPermission,
      geoIsLoading,
      geoError,
      checkGeoPermission,
      requestGeoPermission,
      locale,
      timezone,
      updateTimezone,
      colorScheme,
      setColorScheme,
    ],
  );

  return <CommonContext.Provider value={value}>{children}</CommonContext.Provider>;
}

export function useCommon(): ICommonContext {
  const ctx = useContext(CommonContext);
  if (!ctx) {
    throw new Error("useCommon must be used within CommonProvider");
  }
  return ctx;
}
