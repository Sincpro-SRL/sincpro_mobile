import type { LogLayer } from "@sincpro/client-framework";
import { SettingsRepository } from "@sincpro/mobile/adapters/repositories/setting.repository";
import {
  DEFAULT_ENABLED_LAYERS,
  getEnabledLayers,
  isConsoleDebug,
  isLayerEnabled,
  LOG_LAYERS,
  resetEnabledLayers,
  setConsoleDebug,
  setEnabledLayers,
  setLayerEnabled,
  subscribeLoggerConfig,
} from "@sincpro/mobile/infrastructure/logger";

const DEBUG_MODE_SETTING_KEY = "app.debug_mode";
const DEBUG_LAYERS_SETTING_KEY = "app.debug_log_layers";

function isLayerMap(value: unknown): value is Partial<Record<LogLayer, boolean>> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value as object).every(
    ([key, enabled]) =>
      (LOG_LAYERS as readonly string[]).includes(key) && typeof enabled === "boolean",
  );
}

async function persistLayers(): Promise<void> {
  await SettingsRepository.saveOneSetting(DEBUG_LAYERS_SETTING_KEY, getEnabledLayers());
}

/**
 * Runtime debug surface for hosts and screens.
 *
 * Two levels:
 * 1. Master switch — INFO/DEBUG console output (`setEnabled`).
 * 2. Per-layer mask — which layers may speak when the master is on (`layers.setEnabled`,
 *    `layers.set`, …): infrastructure, adapter, bounded context, application
 *    service, feature.
 *
 * ERROR/WARN always print. Loki INFO also respects the layer mask.
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
   * Restore master switch + layer mask from settings after bootstrap.
   * Safe to call once from CommonProvider.
   */
  async hydrate(): Promise<{
    enabled: boolean;
    layers: Record<LogLayer, boolean>;
  }> {
    const [mode, layers] = await Promise.all([
      SettingsRepository.getSettingByName(DEBUG_MODE_SETTING_KEY),
      SettingsRepository.getSettingByName(DEBUG_LAYERS_SETTING_KEY),
    ]);
    // Only a switch someone saved wins; never saved, the level the app was built with stays
    // (`observability.logs.level`, `EXPO_PUBLIC_LOG_LEVEL`).
    if (typeof mode === "boolean") setConsoleDebug(mode);
    if (isLayerMap(layers)) setEnabledLayers(layers);
    return { enabled: isConsoleDebug(), layers: getEnabledLayers() };
  },

  subscribe: subscribeLoggerConfig,

  layers: {
    all: LOG_LAYERS,

    defaults: (): Record<LogLayer, boolean> => ({ ...DEFAULT_ENABLED_LAYERS }),

    get: getEnabledLayers,

    isEnabled: isLayerEnabled,

    setEnabled(layer: LogLayer, enabled: boolean): void {
      setLayerEnabled(layer, enabled);
    },

    async setEnabledPersist(layer: LogLayer, enabled: boolean): Promise<void> {
      setLayerEnabled(layer, enabled);
      await persistLayers();
    },

    set(patch: Partial<Record<LogLayer, boolean>>): void {
      setEnabledLayers(patch);
    },

    async setPersist(patch: Partial<Record<LogLayer, boolean>>): Promise<void> {
      setEnabledLayers(patch);
      await persistLayers();
    },

    /** Turn every layer on — useful for a short diagnostic session. */
    enableAll(): void {
      setEnabledLayers(Object.fromEntries(LOG_LAYERS.map((layer) => [layer, true])));
    },

    async enableAllPersist(): Promise<void> {
      this.enableAll();
      await persistLayers();
    },

    /** Back to the packaged quiet defaults (adapters off). */
    reset(): void {
      resetEnabledLayers();
    },

    async resetPersist(): Promise<void> {
      resetEnabledLayers();
      await persistLayers();
    },
  },
};
