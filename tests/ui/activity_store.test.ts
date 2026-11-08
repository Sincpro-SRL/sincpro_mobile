import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVITY_EVENT,
  ACTIVITY_SETTING_EVENT,
} from "../../sincpro_mobile/infrastructure/ui/activity.ts";
import { activityStore } from "../../sincpro_mobile/infrastructure/ui/activity_store.ts";
import { UIEventBus } from "../../sincpro_mobile/infrastructure/ui/UIEventBus.ts";

test("every reader shares one activity state fed by a single subscription", () => {
  let notified = 0;
  const offA = activityStore.subscribe(() => {
    notified += 1;
  });
  const offB = activityStore.subscribe(() => {
    notified += 1;
  });
  const before = activityStore.snapshot();

  UIEventBus.emit(ACTIVITY_EVENT, {
    id: "print-1",
    channel: "queue",
    name: "common.print.v1.image_requested",
    label: "Imprimiendo",
    status: "running",
    ui: true,
  });

  const after = activityStore.snapshot();
  assert.notEqual(after, before);
  assert.equal(after.state.running.length, 1);
  assert.equal(notified, 2);
  assert.equal(activityStore.snapshot(), after, "the snapshot is stable between updates");
  offA();
  offB();
});

test("a channel setting change reaches the shared snapshot", () => {
  const off = activityStore.subscribe(() => undefined);
  UIEventBus.emit(ACTIVITY_SETTING_EVENT, { channel: "cron", enabled: false });
  assert.equal(activityStore.snapshot().enabled.cron, false);
  off();
});
