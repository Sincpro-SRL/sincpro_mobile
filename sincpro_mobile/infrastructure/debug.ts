import { SettingsRepository } from "@sincpro/mobile/adapters/repositories/setting.repository";
import {
  DEFAULT_ENABLED_LOGS,
  EApplicationLogger,
  getEnabledLoggers,
  isConsoleDebug,
  isLoggerEnabled,
  resetEnabledLoggers,
  setConsoleDebug,
  setEnabledLoggers,
  setLoggerEnabled,
  subscribeLoggerConfig,
} from "@sincpro/mobile/infrastructure/logger";

const DEBUG_MODE_SETTING_KEY = "app.debug_mode";
const DEBUG_LOGGERS_SETTING_KEY = "app.debug_loggers";

const LOGGER_CONTEXTS = Object.values(EApplicationLogger);

function isLoggerMap(value: unknown): value is Partial<Record<EApplicationLogger, boolean>> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value as object).every((key) =>
    (LOGGER_CONTEXTS as string[]).includes(key),
  );
}

async function persistLoggers(): Promise<void> {
  await SettingsRepository.saveOneSetting(DEBUG_LOGGERS_SETTING_KEY, getEnabledLoggers());
}

/**
 * Runtime debug surface for hosts and screens.
 *
 * Two layers:
 * 1. Master switch — INFO/DEBUG console output (`setEnabled`).
 * 2. Per-context mask — which loggers may speak when the master is on
 *    (`loggers.setEnabled`, `loggers.set`, …).
 *
 * ERROR/WARN always print. Loki INFO also respects the context mask.
 */
export const Debug = {
  isEnabled: isConsoleDebug,

  setEnabled(enabled: boolean): void {
    setConsoleDebug(enabled);
  },

  async setEnabledPersist(enabled: boolean): Promise<void> {
    setConsoleDebug(enabled);
    await SettingsRepository.saveOneSetting(DEBUG_MODE_SETTING_KEY, enabled);
  },

  /**
   * Restore master switch + logger mask from settings after bootstrap.
   * Safe to call once from CommonProvider.
   */
  async hydrate(): Promise<{
    enabled: boolean;
    loggers: Record<EApplicationLogger, boolean>;
  }> {
    const [mode, loggers] = await Promise.all([
      SettingsRepository.getSettingByName(DEBUG_MODE_SETTING_KEY),
      SettingsRepository.getSettingByName(DEBUG_LOGGERS_SETTING_KEY),
    ]);
    setConsoleDebug(mode === true);
    if (isLoggerMap(loggers)) setEnabledLoggers(loggers);
    return { enabled: isConsoleDebug(), loggers: getEnabledLoggers() };
  },

  subscribe: subscribeLoggerConfig,

  loggers: {
    contexts: LOGGER_CONTEXTS,

    defaults: (): Record<EApplicationLogger, boolean> => ({ ...DEFAULT_ENABLED_LOGS }),

    get: getEnabledLoggers,

    isEnabled: isLoggerEnabled,

    setEnabled(context: EApplicationLogger, enabled: boolean): void {
      setLoggerEnabled(context, enabled);
    },

    async setEnabledPersist(context: EApplicationLogger, enabled: boolean): Promise<void> {
      setLoggerEnabled(context, enabled);
      await persistLoggers();
    },

    set(patch: Partial<Record<EApplicationLogger, boolean>>): void {
      setEnabledLoggers(patch);
    },

    async setPersist(patch: Partial<Record<EApplicationLogger, boolean>>): Promise<void> {
      setEnabledLoggers(patch);
      await persistLoggers();
    },

    /** Turn every context on — useful for a short diagnostic session. */
    enableAll(): void {
      const all = Object.fromEntries(
        LOGGER_CONTEXTS.map((context) => [context, true]),
      ) as Record<EApplicationLogger, boolean>;
      setEnabledLoggers(all);
    },

    async enableAllPersist(): Promise<void> {
      this.enableAll();
      await persistLoggers();
    },

    /** Back to the packaged quiet defaults (Odoo/adapters/repos off). */
    reset(): void {
      resetEnabledLoggers();
    },

    async resetPersist(): Promise<void> {
      resetEnabledLoggers();
      await persistLoggers();
    },
  },
};
