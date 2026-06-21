import { GeoAdapter } from "@sincpro/mobile/adapters/Geo.adapter";
import { SettingsRepository } from "@sincpro/mobile/adapters/repositories/setting.repository";
import { QueueEndEvent, QueueStartEvent } from "@sincpro/mobile/domain/events";
import logger, { loggerUseCases } from "@sincpro/mobile/infrastructure/logger";
import { UIEventBus } from "@sincpro/mobile/infrastructure/ui/UIEventBus";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface TimezoneLocale {
  timezone: string;
  locale: string;
}

const DEBUG_MODE_SETTING_KEY = "app.debug_mode";
const TIMEZONE_SETTING_KEY = "app.timezone";
const LOCALE_SETTING_KEY = "app.locale";

const QUEUE_MIN_VISIBLE_MS = 1200;

interface QueueEventPayload {
  event: string;
  label: string;
  success?: boolean;
  error?: string;
}

interface CronEventPayload {
  task: string;
  label?: string;
}

interface Activity {
  id: string;
  label: string;
  type: "queue" | "cron";
  status: "running" | "failed";
  error?: string;
  startedAt: number;
}

interface ICommonContext {
  debugMode: boolean;
  debugModeLoaded: boolean;
  toggleDebugMode: () => Promise<void>;
  currentActivity?: Activity;
  lastError?: Activity;
  isProcessing: boolean;
  dismiss: () => void;
  hasGeoPermission: boolean;
  geoIsLoading: boolean;
  geoError: string | null;
  checkGeoPermission: () => Promise<void>;
  requestGeoPermission: () => Promise<boolean>;
  timezone: string | null;
  updateTimezone: (tz: TimezoneLocale) => Promise<void>;
}

const CommonContext = createContext<ICommonContext | null>(null);

interface CommonProviderProps {
  children: ReactNode;
}

export function CommonProvider({ children }: CommonProviderProps) {
  const [debugMode, setDebugMode] = useState(false);
  const [debugModeLoaded, setDebugModeLoaded] = useState(false);

  const [currentActivity, setCurrentActivity] = useState<Activity | undefined>(undefined);
  const [cronTasks, setCronTasks] = useState<Map<string, Activity>>(new Map());
  const [lastError, setLastError] = useState<Activity | undefined>(undefined);
  const [dismissed, setDismissed] = useState(false);

  const [hasGeoPermission, setHasGeoPermission] = useState(false);
  const [geoIsLoading, setGeoIsLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);

  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const queueClearTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  const dismiss = useCallback(() => {
    setDismissed(true);
    setLastError(undefined);
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }
  }, []);

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
    } catch (error) {
      logger.warn(error);
    }
  }, []);

  useEffect(() => {
    async function loadTimezone() {
      try {
        const timezoneResult =
          await SettingsRepository.getSettingByName(TIMEZONE_SETTING_KEY);
        setTimezone(timezoneResult);
      } catch (error) {
        logger.warn("Failed to load timezone", error);
      }
    }
    loadTimezone();
  }, []);

  useEffect(() => {
    loggerUseCases.debug("[CommonProvider] Setting up UIEventBus listeners");

    function handleQueueStart(payload: unknown) {
      if (!payload || typeof payload !== "object") return;
      const { event, label } = payload as QueueEventPayload;
      if (!label) return;

      setCurrentActivity({
        id: event,
        label,
        type: "queue",
        status: "running",
        startedAt: Date.now(),
      });
      setDismissed(false);
    }

    function handleQueueEnd(payload: unknown) {
      if (!payload || typeof payload !== "object") return;
      const { event, success = true, error } = payload as QueueEventPayload;

      setCurrentActivity((current) => {
        if (current?.id !== event) return current;

        if (!success) {
          const failedActivity: Activity = { ...current, status: "failed", error };
          setLastError(failedActivity);

          if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
          errorTimeoutRef.current = setTimeout(() => {
            setLastError(undefined);
            errorTimeoutRef.current = null;
          }, 10000);
          return undefined;
        }

        // Éxito: mantener visible un mínimo para que la cola sea perceptible
        // aunque el evento se procese al instante.
        const remaining = QUEUE_MIN_VISIBLE_MS - (Date.now() - current.startedAt);
        if (remaining > 0) {
          if (queueClearTimeoutRef.current) clearTimeout(queueClearTimeoutRef.current);
          queueClearTimeoutRef.current = setTimeout(() => {
            setCurrentActivity((c) => (c?.id === event ? undefined : c));
            queueClearTimeoutRef.current = null;
          }, remaining);
          return current;
        }
        return undefined;
      });
    }

    function handleCronStart(payload: unknown) {
      if (!payload || typeof payload !== "object" || !("task" in payload)) return;
      const { task } = payload as CronEventPayload;

      setCronTasks((prev) => {
        const next = new Map(prev);
        next.set(task, {
          id: task,
          label: task,
          type: "cron",
          status: "running",
          startedAt: Date.now(),
        });
        return next;
      });
    }

    function handleCronEnd(payload: unknown) {
      if (!payload || typeof payload !== "object" || !("task" in payload)) return;
      const { task } = payload as CronEventPayload;

      setCronTasks((prev) => {
        const next = new Map(prev);
        next.delete(task);
        return next;
      });
    }

    const unsubscribers = [
      UIEventBus.on(QueueStartEvent.name, handleQueueStart),
      UIEventBus.on(QueueEndEvent.name, handleQueueEnd),
      UIEventBus.on("CRON_START", handleCronStart),
      UIEventBus.on("CRON_END", handleCronEnd),
    ];

    return () => {
      loggerUseCases.debug("[CommonProvider] Cleaning up UIEventBus listeners");
      unsubscribers.forEach((unsub) => unsub());
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      if (queueClearTimeoutRef.current) clearTimeout(queueClearTimeoutRef.current);
    };
  }, []);

  const displayActivity = useMemo(() => {
    if (currentActivity) return currentActivity;
    const firstCron = cronTasks.values().next().value;
    if (firstCron) return firstCron;
    return undefined;
  }, [currentActivity, cronTasks]);

  const isProcessing = useMemo(() => {
    if (dismissed) return false;
    return !!(currentActivity || cronTasks.size > 0 || lastError);
  }, [currentActivity, cronTasks, lastError, dismissed]);

  const value = useMemo<ICommonContext>(
    () => ({
      debugMode,
      debugModeLoaded,
      toggleDebugMode,
      currentActivity: displayActivity,
      lastError,
      isProcessing,
      dismiss,
      hasGeoPermission,
      geoIsLoading,
      geoError,
      checkGeoPermission,
      requestGeoPermission,
      timezone,
      updateTimezone,
    }),
    [
      debugMode,
      debugModeLoaded,
      toggleDebugMode,
      displayActivity,
      lastError,
      isProcessing,
      dismiss,
      hasGeoPermission,
      geoIsLoading,
      geoError,
      checkGeoPermission,
      requestGeoPermission,
      timezone,
      updateTimezone,
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
