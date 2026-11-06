import { SettingsRepository } from "@sincpro/mobile/adapters/repositories/setting.repository";
import { type LabelText, textOf } from "@sincpro/mobile/domain/events/label";
import { ECommonSetting } from "@sincpro/mobile/domain/settings";

import { UIEventBus } from "./UIEventBus";

export const ACTIVITY_EVENT = "ui.activity";
export const ACTIVITY_SETTING_EVENT = "ui.activity.setting";

export type ActivityChannel = "queue" | "cron" | "device";

export type ActivityStatus = "running" | "succeeded" | "failed" | "idle";

export interface ActivityFact {
  id: string;
  channel: ActivityChannel;
  name: string;
  label: LabelText;
  detail?: LabelText;
  status: ActivityStatus;
  ui: boolean;
  variant?: "success" | "danger" | "info";
}

export interface ActivityState {
  running: ActivityFact[];
  failure?: ActivityFact;
  notices: ActivityFact[];
}

export interface ActivitySettingChange {
  channel: ActivityChannel;
  enabled: boolean;
}

export const emptyActivity: ActivityState = { running: [], notices: [] };

const SETTING_KEY: Record<ActivityChannel, ECommonSetting> = {
  queue: ECommonSetting.UI_QUEUE,
  cron: ECommonSetting.UI_CRON,
  device: ECommonSetting.UI_DEVICE,
};

let sequence = 0;

export function declaresUi(source: object): boolean {
  return (source.constructor as { ui?: boolean }).ui === true;
}

export function publishActivity(fact: Omit<ActivityFact, "id">): ActivityFact {
  const full: ActivityFact = { ...fact, id: `${fact.channel}:${fact.name}:${++sequence}` };
  UIEventBus.emit(ACTIVITY_EVENT, full);
  return full;
}

export function notifyDevice(input: {
  name: string;
  title: LabelText;
  message: LabelText;
  variant: "success" | "danger" | "info";
}): void {
  publishActivity({
    channel: "device",
    name: input.name,
    label: input.title,
    detail: input.message,
    status: input.variant === "danger" ? "failed" : "succeeded",
    variant: input.variant,
    ui: true,
  });
}

export async function loadActivityEnabled(): Promise<Record<ActivityChannel, boolean>> {
  const enabled: Record<ActivityChannel, boolean> = {
    queue: true,
    cron: true,
    device: true,
  };
  for (const channel of Object.keys(SETTING_KEY) as ActivityChannel[]) {
    try {
      const value = await SettingsRepository.getSettingByName(SETTING_KEY[channel]);
      if (value === false) enabled[channel] = false;
    } catch {
      return enabled;
    }
  }
  return enabled;
}

export async function setActivityEnabled(
  channel: ActivityChannel,
  enabled: boolean,
): Promise<void> {
  await SettingsRepository.saveOneSetting(SETTING_KEY[channel], enabled);
  const change: ActivitySettingChange = { channel, enabled };
  UIEventBus.emit(ACTIVITY_SETTING_EVENT, change);
}

export function activityVisible(
  fact: ActivityFact,
  enabled: Record<ActivityChannel, boolean>,
  all = false,
): boolean {
  if (all) return true;
  if (!fact.ui) return false;
  if (!enabled[fact.channel]) return false;
  if (fact.channel !== "device" && textOf(fact.label).length === 0) return false;
  return true;
}

export function applyActivity(state: ActivityState, fact: ActivityFact): ActivityState {
  if (fact.channel === "device") {
    return { ...state, notices: [...state.notices, fact].slice(-8) };
  }

  const running = state.running.filter(
    (item) => item.channel !== fact.channel || item.name !== fact.name,
  );
  const sameFailure =
    state.failure?.channel === fact.channel && state.failure.name === fact.name;

  if (fact.status === "running") {
    return { ...state, running: [...running, fact], failure: undefined };
  }
  if (fact.status === "failed") {
    return { ...state, running, failure: fact };
  }
  return {
    ...state,
    running,
    failure: sameFailure ? undefined : state.failure,
  };
}
