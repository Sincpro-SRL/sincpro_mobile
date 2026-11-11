import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ENABLED_LAYERS,
  getEnabledLayers,
  isConsoleDebug,
  isLayerEnabled,
  resetEnabledLayers,
  setConsoleDebug,
  setEnabledLayers,
  setLayerEnabled,
  subscribeLoggerConfig,
} from "../../sincpro_mobile/infrastructure/logger.ts";

test("log layers start from the quiet defaults: adapters off", () => {
  resetEnabledLayers();
  assert.deepEqual(getEnabledLayers(), DEFAULT_ENABLED_LAYERS);
  assert.equal(isLayerEnabled("adapter"), false);
  assert.equal(isLayerEnabled("infrastructure"), true);
  assert.equal(isLayerEnabled("feature"), true);
});

test("setLayerEnabled flips one layer and notifies subscribers", () => {
  resetEnabledLayers();
  let ticks = 0;
  const stop = subscribeLoggerConfig(() => {
    ticks += 1;
  });

  setLayerEnabled("adapter", true);
  assert.equal(isLayerEnabled("adapter"), true);
  assert.equal(ticks, 1);

  setLayerEnabled("adapter", true);
  assert.equal(ticks, 1, "identical writes stay quiet");

  stop();
  setLayerEnabled("adapter", false);
  assert.equal(ticks, 1);
});

test("setEnabledLayers patches several layers at once", () => {
  resetEnabledLayers();
  setEnabledLayers({ adapter: true, feature: false });

  const snapshot = getEnabledLayers();
  assert.equal(snapshot.adapter, true);
  assert.equal(snapshot.feature, false);
  assert.equal(snapshot.entrypoint, true);

  resetEnabledLayers();
  assert.deepEqual(getEnabledLayers(), DEFAULT_ENABLED_LAYERS);
});

test("master console switch notifies independently of layer masks", () => {
  setConsoleDebug(false);
  let ticks = 0;
  const stop = subscribeLoggerConfig(() => {
    ticks += 1;
  });

  setConsoleDebug(true);
  assert.equal(isConsoleDebug(), true);
  assert.equal(ticks, 1);

  setConsoleDebug(true);
  assert.equal(ticks, 1);

  setConsoleDebug(false);
  stop();
});
