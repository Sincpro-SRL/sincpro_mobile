import { logger, type LogLayer } from "@sincpro/client-framework";
import { GeoAdapter } from "@sincpro/mobile/adapters/Geo.adapter";
import { EAppSetting } from "@sincpro/mobile/domain/settings";
import { appSettings } from "@sincpro/mobile/infrastructure/app_settings";
import { Debug } from "@sincpro/mobile/infrastructure/debug";
import { errorAttributes, getEnabledLayers } from "@sincpro/mobile/infrastructure/logger";
import { CommandApplyAppSettings, commonBoundedContext } from "@sincpro/mobile/services";
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
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Appearance, AppState } from "react-native";

import {
  type ColorSchemeChoice,
  type ColorSchemeFollower,
  followColorScheme,
} from "./color_scheme";

export interface TimezoneLocale {
  timezone: string;
  locale: string;
}

interface ICommonContext {
  debugMode: boolean;
  debugModeLoaded: boolean;
  toggleDebugMode: () => Promise<void>;
  /** Which layers may emit INFO while debug mode is on. */
  logLayers: Record<LogLayer, boolean>;
  setLogLayerEnabled: (layer: LogLayer, enabled: boolean) => Promise<void>;
  resetLogLayers: () => Promise<void>;
  hasGeoPermission: boolean;
  geoIsLoading: boolean;
  geoError: string | null;
  checkGeoPermission: () => Promise<void>;
  requestGeoPermission: () => Promise<boolean>;
  locale: string | null;
  timezone: string | null;
  updateTimezone: (tz: TimezoneLocale) => Promise<void>;
  colorScheme: ColorSchemeChoice;
  setColorScheme: (scheme: ColorSchemeChoice) => Promise<void>;
}

const CommonContext = createContext<ICommonContext | null>(null);

interface CommonProviderProps {
  children: ReactNode;
  lightTheme?: ThemeTokens;
  darkTheme?: ThemeTokens;
}

/** Saves settings and applies them at once (`CommandApplyAppSettings`); a failure is logged. */
async function applySettings(
  settings: { key: EAppSetting; value: unknown }[],
): Promise<void> {
  try {
    await commonBoundedContext.execute(new CommandApplyAppSettings(settings));
  } catch (error) {
    logger.warn("The settings could not be saved", errorAttributes(error));
  }
}

/**
 * What every screen reads of the app: its debug switch, its time zone, language and colors, and
 * the location permission. The settings were loaded by the kernel's bootstrap before this
 * mounts (`appSettings`, `Debug.hydrate`), so they are read as they are — no default shown first
 * and replaced a moment later — and followed when they change.
 */
export function CommonProvider({ children, lightTheme, darkTheme }: CommonProviderProps) {
  const [debugMode, setDebugMode] = useState(() => Debug.isEnabled());
  const debugModeLoaded = true;
  const [logLayers, setLogLayers] = useState(getEnabledLayers);
  const settings = useSyncExternalStore(appSettings.subscribe, appSettings.snapshot);

  const [hasGeoPermission, setHasGeoPermission] = useState(false);
  const [geoIsLoading, setGeoIsLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const locale = settings.locale;
  const timezone = settings.timeZone;
  const colorScheme = settings.colorScheme;

  useEffect(
    () =>
      Debug.subscribe(() => {
        setDebugMode(Debug.isEnabled());
        setLogLayers(Debug.layers.get());
      }),
    [],
  );

  const toggleDebugMode = useCallback(async () => {
    await Debug.setEnabledPersist(!debugMode);
  }, [debugMode]);

  const setLogLayerEnabled = useCallback(async (layer: LogLayer, enabled: boolean) => {
    await Debug.layers.setEnabledPersist(layer, enabled);
  }, []);

  const resetLogLayers = useCallback(async () => {
    await Debug.layers.resetPersist();
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
    await applySettings([
      { key: EAppSetting.TIME_ZONE, value: tz.timezone },
      { key: EAppSetting.LOCALE, value: tz.locale },
    ]);
  }, []);

  const scheme = useRef<ColorSchemeFollower | null>(null);

  const setColorScheme = useCallback(async (choice: ColorSchemeChoice) => {
    await applySettings([{ key: EAppSetting.COLOR_SCHEME, value: choice }]);
  }, []);

  // Returning to the foreground re-reads the permission quietly: no loading
  // flag, and React skips the update when the value did not change, so the
  // whole tree under this provider does not re-render on every resume.
  useEffect(() => {
    Promise.resolve().then(() => checkGeoPermission());
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      GeoAdapter.hasPermission().then(setHasGeoPermission, (error: unknown) =>
        logger.warn("Failed to refresh location permission", errorAttributes(error)),
      );
    });
    return () => sub.remove();
  }, [checkGeoPermission]);

  // Follows the persisted color scheme, and the phone's while it is "system".
  useEffect(() => {
    const follower = followColorScheme(Appearance, (resolved) =>
      setActiveTheme(
        resolved === "dark"
          ? (darkTheme ?? DEFAULT_DARK_THEME)
          : (lightTheme ?? DEFAULT_THEME),
      ),
    );
    scheme.current = follower;
    follower.choose(appSettings.snapshot().colorScheme);
    return () => {
      follower.stop();
      scheme.current = null;
    };
  }, [lightTheme, darkTheme]);

  useEffect(() => {
    scheme.current?.choose(colorScheme);
  }, [colorScheme]);

  const value = useMemo<ICommonContext>(
    () => ({
      debugMode,
      debugModeLoaded,
      toggleDebugMode,
      logLayers,
      setLogLayerEnabled,
      resetLogLayers,
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
      logLayers,
      setLogLayerEnabled,
      resetLogLayers,
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
