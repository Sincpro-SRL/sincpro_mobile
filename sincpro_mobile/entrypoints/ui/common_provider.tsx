import { GeoAdapter } from "@sincpro/mobile/adapters/Geo.adapter";
import { SettingsRepository } from "@sincpro/mobile/adapters/repositories/setting.repository";
import logger from "@sincpro/mobile/infrastructure/logger";
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

const DEBUG_MODE_SETTING_KEY = "app.debug_mode";
const TIMEZONE_SETTING_KEY = "app.timezone";
const LOCALE_SETTING_KEY = "app.locale";
const COLOR_SCHEME_SETTING_KEY = "app.color_scheme";

interface ICommonContext {
  debugMode: boolean;
  debugModeLoaded: boolean;
  toggleDebugMode: () => Promise<void>;
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

  const [hasGeoPermission, setHasGeoPermission] = useState(false);
  const [geoIsLoading, setGeoIsLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [locale, setLocale] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [colorScheme, setColorSchemeState] = useState<"light" | "dark" | "system">("system");

  useEffect(() => {
    async function loadDebugMode() {
      const value = await SettingsRepository.getSettingByName(DEBUG_MODE_SETTING_KEY);
      setDebugMode(value === true);
      setDebugModeLoaded(true);
    }
    loadDebugMode();
  }, []);

  const toggleDebugMode = useCallback(async () => {
    const newValue = !debugMode;
    await SettingsRepository.saveOneSetting(DEBUG_MODE_SETTING_KEY, newValue);
    setDebugMode(newValue);
  }, [debugMode]);

  const checkGeoPermission = useCallback(async () => {
    setGeoIsLoading(true);
    setGeoError(null);
    try {
      const granted = await GeoAdapter.hasPermission();
      setHasGeoPermission(granted);
    } catch (error) {
      setGeoError((error as Error).message);
      setHasGeoPermission(false);
    } finally {
      setGeoIsLoading(false);
    }
  }, []);

  const requestGeoPermission = useCallback(async () => {
    setGeoIsLoading(true);
    setGeoError(null);
    try {
      const granted = await GeoAdapter.requestPermission();
      setHasGeoPermission(granted);
      return granted;
    } catch (error) {
      setGeoError((error as Error).message);
      setHasGeoPermission(false);
      return false;
    } finally {
      setGeoIsLoading(false);
    }
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

  useEffect(() => {
    Promise.resolve().then(() => checkGeoPermission());
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") Promise.resolve().then(() => checkGeoPermission());
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
