import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { configureProcess, installTimeZone, timeZoneNow } from "@sincpro/client-framework";
import { type MemoryLogger, memoryLogger } from "@sincpro/client-framework/testing";

import { deviceClock } from "../../sincpro_mobile/domain/database/criteria_sql.ts";
import { EAppSetting } from "../../sincpro_mobile/domain/settings.ts";
import { createAppSettings } from "../../sincpro_mobile/infrastructure/app_settings.ts";
import type { CommonDependencies } from "../../sincpro_mobile/infrastructure/dependencies.ts";
import {
  CommandApplyAppSettings,
  commonBoundedContext,
} from "../../sincpro_mobile/services/index.ts";
import {
  formatDate,
  formatDateWithDefaultTimezone,
  getCurrentDateInTimezone,
} from "../../sincpro_mobile/tools/utils/date.ts";

const PLATFORM_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** A settings table in memory: what is saved is what is read. */
function settingsTable(saved: Record<string, unknown> = {}) {
  const rows = new Map(Object.entries(saved));
  return {
    rows,
    getSettingByName: async (name: string) => rows.get(name) ?? null,
    saveOneSetting: async (name: string, value: unknown) => void rows.set(name, value),
  };
}

let logs: MemoryLogger;
let restores: (() => void)[];

function swap<K extends keyof CommonDependencies>(name: K, fake: object): void {
  const current = commonBoundedContext.deps[name];
  commonBoundedContext.addDependency(name, fake as CommonDependencies[K], {
    replaces: current,
  });
  restores.push(() =>
    commonBoundedContext.addDependency(name, current, {
      replaces: fake as CommonDependencies[K],
    }),
  );
}

beforeEach(() => {
  logs = memoryLogger();
  configureProcess({ logger: { engine: logs } });
  restores = [];
});

afterEach(() => {
  for (const restore of restores.reverse()) restore();
  installTimeZone(undefined);
});

test("loading the settings installs the app's time zone: every clock of the app follows it", async () => {
  const settings = createAppSettings(
    settingsTable({
      [EAppSetting.TIME_ZONE]: "Asia/Tokyo",
      [EAppSetting.LOCALE]: "ja-JP",
      [EAppSetting.COLOR_SCHEME]: "dark",
    }),
  );
  let told = 0;
  settings.subscribe(() => told++);

  const state = await settings.load();

  assert.deepEqual(state, { timeZone: "Asia/Tokyo", locale: "ja-JP", colorScheme: "dark" });
  assert.deepEqual(settings.snapshot(), state);
  assert.equal(timeZoneNow(), "Asia/Tokyo");
  assert.equal(deviceClock(new Date("2026-10-24T20:00:00.000Z")).timeZone, "Asia/Tokyo");
  assert.equal(told, 1);
});

test("nothing saved is the platform's zone and language, and the phone's colors", async () => {
  installTimeZone("Asia/Tokyo");
  const settings = createAppSettings(settingsTable());

  assert.deepEqual(settings.snapshot(), {
    timeZone: null,
    locale: null,
    colorScheme: "system",
  });
  assert.deepEqual(await settings.load(), {
    timeZone: null,
    locale: null,
    colorScheme: "system",
  });
  assert.equal(timeZoneNow(), PLATFORM_ZONE, "a zone installed before is not kept");
});

test("a saved zone that is not one falls back to the platform's, said once in the log", async () => {
  const settings = createAppSettings(
    settingsTable({
      [EAppSetting.TIME_ZONE]: "Mars/Base",
      [EAppSetting.COLOR_SCHEME]: "sepia",
    }),
  );

  const state = await settings.load();

  assert.equal(state.timeZone, null);
  assert.equal(state.colorScheme, "system");
  assert.equal(timeZoneNow(), PLATFORM_ZONE);
  assert.equal(logs.records.filter((record) => record.level === "warn").length, 1);
});

test("a setting that cannot be read keeps its default; the others are read", async () => {
  const table = settingsTable({ [EAppSetting.TIME_ZONE]: "America/La_Paz" });
  const settings = createAppSettings({
    getSettingByName: (name) =>
      name === EAppSetting.LOCALE
        ? Promise.reject(new Error("database is locked"))
        : table.getSettingByName(name),
  });

  const state = await settings.load();

  assert.equal(state.timeZone, "America/La_Paz");
  assert.equal(state.locale, null);
  assert.equal(timeZoneNow(), "America/La_Paz");
});

test("a time zone applied is saved and installed at once, and whoever shows it is told", async () => {
  const table = settingsTable();
  const settings = createAppSettings(table);
  swap("settingsStore", table);
  swap("appSettings", settings);
  let told = 0;
  settings.subscribe(() => told++);

  const applied = await commonBoundedContext.execute(
    new CommandApplyAppSettings([
      { key: EAppSetting.TIME_ZONE, value: "America/La_Paz" },
      { key: EAppSetting.LOCALE, value: "es-BO" },
    ]),
  );

  assert.equal(applied, 2);
  assert.equal(table.rows.get(EAppSetting.TIME_ZONE), "America/La_Paz");
  assert.equal(timeZoneNow(), "America/La_Paz");
  assert.deepEqual(settings.snapshot(), {
    timeZone: "America/La_Paz",
    locale: "es-BO",
    colorScheme: "system",
  });
  assert.equal(told, 1);
});

test("a date written without a zone is the app's day, not a fixed company's", () => {
  const evening = new Date("2025-09-02T20:00:00.000Z");

  installTimeZone("Asia/Tokyo");
  const inTokyo = formatDate(evening, null, { showTime: false });
  const byDefault = formatDateWithDefaultTimezone(evening, { showTime: false });
  installTimeZone("America/La_Paz");
  const inLaPaz = formatDate(evening, undefined, { showTime: false });

  assert.match(inTokyo, /^3 de septiembre/);
  assert.equal(byDefault, inTokyo);
  assert.match(inLaPaz, /^2 de septiembre/);
  assert.match(formatDate(evening, "Asia/Tokyo", { showTime: false }), /^3 de septiembre/);
});

test("today without a zone is today where the app is", () => {
  installTimeZone("Pacific/Kiritimati");
  const farEast = getCurrentDateInTimezone();
  installTimeZone("Pacific/Pago_Pago");
  const farWest = getCurrentDateInTimezone();

  assert.notEqual(farEast, farWest, "UTC+14 and UTC-11 are never on the same day");
});
