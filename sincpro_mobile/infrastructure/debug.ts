import type { LogLayer } from "@sincpro/client-framework";
import { SettingsRepository } from "@sincpro/mobile/adapters/repositories/setting.repository";
import {
  defaultEnabledLayers,
  getEnabledLayers,
  isDebugLogging,
  isLayerEnabled,
  LOG_LAYERS,
  resetEnabledLayers,
  setDebugLogging,
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
 * 1. Master switch — debugging (`setEnabled`): every line speaks, on the console of a debug build
 *    and to Loki, instead of what the app ships normally (`observability.logs`).
 * 2. Per-layer mask — which layers speak while debugging (`layers.setEnabled`, `layers.set`, …):
 *    infrastructure, adapter, bounded context, event handler, application service, feature.
 *
 * WARN and ERROR always speak. Spans are never filtered.
 */
export const Debug = {
  isEnabled: isDebugLogging,

  setEnabled(enabled: boolean): void {
    setDebugLogging(enabled);
  },

  async setEnabledPersist(enabled: boolean): Promise<void> {
    setDebugLogging(enabled);
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
    if (typeof mode === "boolean") setDebugLogging(mode);
    if (isLayerMap(layers)) setEnabledLayers(layers);
    return { enabled: isDebugLogging(), layers: getEnabledLayers() };
  },

  subscribe: subscribeLoggerConfig,

  layers: {
    all: LOG_LAYERS,

    defaults: defaultEnabledLayers,

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

    /** Back to the debug filter's layers (the app's `logs.debug`; every layer by default). */
    reset(): void {
      resetEnabledLayers();
    },

    async resetPersist(): Promise<void> {
      resetEnabledLayers();
      await persistLayers();
    },
  },
};
