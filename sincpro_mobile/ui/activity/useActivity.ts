import {
  type ActivityVisibility,
  activityVisible,
} from "@sincpro/mobile/infrastructure/ui/activity";
import { activityStore } from "@sincpro/mobile/infrastructure/ui/activity_store";
import { useMemo, useSyncExternalStore } from "react";

export function useActivity(options?: { all?: boolean; mode?: ActivityVisibility }) {
  const mode: ActivityVisibility = options?.mode ?? options?.all ?? false;
  const { state, enabled } = useSyncExternalStore(
    activityStore.subscribe,
    activityStore.snapshot,
    activityStore.snapshot,
  );

  return useMemo(() => {
    const visible = state.running.filter((fact) => activityVisible(fact, enabled, mode));
    const queues = visible.filter((fact) => fact.channel === "queue");
    return {
      queue: queues[queues.length - 1],
      crons: visible.filter((fact) => fact.channel === "cron"),
      failure:
        state.failure && activityVisible(state.failure, enabled, mode)
          ? state.failure
          : undefined,
      notices: state.notices.filter((fact) => activityVisible(fact, enabled, mode)),
    };
  }, [enabled, mode, state]);
}
