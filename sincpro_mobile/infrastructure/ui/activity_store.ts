import {
  ACTIVITY_EVENT,
  ACTIVITY_SETTING_EVENT,
  type ActivityChannel,
  type ActivityFact,
  type ActivitySettingChange,
  type ActivityState,
  applyActivity,
  emptyActivity,
  loadActivityEnabled,
} from "@sincpro/mobile/infrastructure/ui/activity";
import { UIEventBus } from "@sincpro/mobile/infrastructure/ui/UIEventBus";

export interface ActivitySnapshot {
  state: ActivityState;
  enabled: Record<ActivityChannel, boolean>;
}

let snapshot: ActivitySnapshot = {
  state: emptyActivity,
  enabled: { queue: true, cron: true, device: true },
};
let started = false;
const listeners = new Set<() => void>();

function update(next: Partial<ActivitySnapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const listener of [...listeners]) listener();
}

/**
 * One subscription to the activity facts and one settings read for the whole
 * app. Every reader (toast, notices, strip) sees the same state.
 */
function start() {
  if (started) return;
  started = true;
  UIEventBus.on(
    ACTIVITY_EVENT,
    (payload) => update({ state: applyActivity(snapshot.state, payload as ActivityFact) }),
    { debounce: false },
  );
  UIEventBus.on(
    ACTIVITY_SETTING_EVENT,
    (payload) => {
      const change = payload as ActivitySettingChange;
      update({ enabled: { ...snapshot.enabled, [change.channel]: change.enabled } });
    },
    { debounce: false },
  );
  loadActivityEnabled().then(
    (enabled) => update({ enabled }),
    () => undefined,
  );
}

export const activityStore = {
  subscribe(listener: () => void) {
    start();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  snapshot(): ActivitySnapshot {
    return snapshot;
  },
};
