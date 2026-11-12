import { installTimeZone, logger } from "@sincpro/client-framework";
import { SettingsRepository } from "@sincpro/mobile/adapters/repositories/setting.repository";
import {
  type AppSettings,
  type AppSettingsState,
  type ColorSchemeChoice,
  EAppSetting,
} from "@sincpro/mobile/domain/settings";
import { errorAttributes } from "@sincpro/mobile/infrastructure/logger";

const DEFAULTS: AppSettingsState = { timeZone: null, locale: null, colorScheme: "system" };

type SettingsReader = { getSettingByName(name: string): Promise<unknown> };

function timeZoneOf(saved: unknown): string | null {
  if (typeof saved !== "string" || !saved) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: saved });
    return saved;
  } catch {
    logger.warn("A saved time zone is not one; the platform's is used", { timeZone: saved });
    return null;
  }
}

function colorSchemeOf(saved: unknown): ColorSchemeChoice {
  return saved === "light" || saved === "dark" ? saved : "system";
}

/**
 * The app's settings held by the process (`AppSettings`).
 *
 * Context: a time zone read by each screen when it mounts, and by nothing else, is how
 * `today` meant one thing on a screen, another in a criteria and a third in a background
 * task. Here it is read once, where the app starts, and **installed** in client-framework
 * (`installTimeZone`): every date the app reads or writes, every criteria it compiles
 * (`deviceClock`), every day a screen filters by, follows it. A change saved by
 * `CommandApplyAppSettings` is loaded again and installed at once.
 *
 * 1. Each setting is read from the settings table; one that cannot be read keeps its default.
 * 2. A time zone that is not one (`Mars/Base`) is the platform's, said once in the log.
 * Final: the state, the time zone installed, every follower told.
 */
export function createAppSettings(store: SettingsReader): AppSettings {
  let state = DEFAULTS;
  const listeners = new Set<() => void>();

  const read = async (key: EAppSetting): Promise<unknown> => {
    try {
      return await store.getSettingByName(key);
    } catch (error) {
      logger.warn("A setting could not be read; its default is used", {
        setting: key,
        ...errorAttributes(error),
      });
      return null;
    }
  };

  return {
    snapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async load() {
      const [timeZone, locale, colorScheme] = await Promise.all([
        read(EAppSetting.TIME_ZONE),
        read(EAppSetting.LOCALE),
        read(EAppSetting.COLOR_SCHEME),
      ]);
      state = {
        timeZone: timeZoneOf(timeZone),
        locale: typeof locale === "string" && locale ? locale : null,
        colorScheme: colorSchemeOf(colorScheme),
      };
      installTimeZone(state.timeZone ?? undefined);
      for (const listener of listeners) listener();
      return state;
    },
  };
}

/** The app's settings, read by the kernel's bootstrap from the settings table. */
export const appSettings: AppSettings = createAppSettings(SettingsRepository);
