export enum ECommonSetting {
  SELECTED_PRINTER = "common.selected_printer",
  UI_QUEUE = "ui.queue",
  UI_CRON = "ui.cron",
  UI_DEVICE = "ui.device",
}

export interface ISetting {
  key: string;
  value: unknown;
}

/** The settings the app itself keeps, by the key they are stored under. */
export enum EAppSetting {
  TIME_ZONE = "app.timezone",
  LOCALE = "app.locale",
  COLOR_SCHEME = "app.color_scheme",
}

/** The color scheme a person chose: the phone's (`system`), or always one. */
export type ColorSchemeChoice = "light" | "dark" | "system";

/** What the app runs with — its time zone, its language, its colors —, in one place. */
export interface AppSettingsState {
  /** IANA (`America/La_Paz`); `null` is the platform's. */
  timeZone: string | null;
  /** BCP 47 (`es-BO`); `null` is the phone's. */
  locale: string | null;
  colorScheme: ColorSchemeChoice;
}

/**
 * The app's settings as the process holds them: read once at start (`load`, by the kernel's
 * bootstrap, in the foreground and in a background task alike), applied when they change, and
 * followed by whoever shows them (`subscribe`).
 */
export interface AppSettings {
  snapshot(): AppSettingsState;
  subscribe(listener: () => void): () => void;
  load(): Promise<AppSettingsState>;
}
