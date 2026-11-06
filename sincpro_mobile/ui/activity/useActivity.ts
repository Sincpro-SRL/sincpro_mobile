import {
  ACTIVITY_EVENT,
  ACTIVITY_SETTING_EVENT,
  type ActivityChannel,
  type ActivityFact,
  type ActivitySettingChange,
  type ActivityState,
  activityVisible,
  applyActivity,
  emptyActivity,
  loadActivityEnabled,
} from "@sincpro/mobile/infrastructure/ui/activity";
import { UIEventBus } from "@sincpro/mobile/infrastructure/ui/UIEventBus";
import { useEffect, useMemo, useState } from "react";

const CHANNELS_ON: Record<ActivityChannel, boolean> = {
  queue: true,
  cron: true,
  device: true,
};

export function useActivity(options?: { all?: boolean }) {
  const all = options?.all ?? false;
  const [state, setState] = useState<ActivityState>(emptyActivity);
  const [enabled, setEnabled] = useState(CHANNELS_ON);

  useEffect(() => {
    let alive = true;
    loadActivityEnabled().then((next) => {
      if (alive) setEnabled(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const offFact = UIEventBus.on(
      ACTIVITY_EVENT,
      (payload) => {
        setState((current) => applyActivity(current, payload as ActivityFact));
      },
      { debounce: false },
    );
    const offSetting = UIEventBus.on(
      ACTIVITY_SETTING_EVENT,
      (payload) => {
        const change = payload as ActivitySettingChange;
        setEnabled((current) => ({ ...current, [change.channel]: change.enabled }));
      },
      { debounce: false },
    );
    return () => {
      offFact();
      offSetting();
    };
  }, []);

  return useMemo(() => {
    const visible = state.running.filter((fact) => activityVisible(fact, enabled, all));
    const queues = visible.filter((fact) => fact.channel === "queue");
    return {
      queue: queues[queues.length - 1],
      crons: visible.filter((fact) => fact.channel === "cron"),
      failure:
        state.failure && activityVisible(state.failure, enabled, all)
          ? state.failure
          : undefined,
      notices: state.notices.filter((fact) => activityVisible(fact, enabled, all)),
    };
  }, [all, enabled, state]);
}
