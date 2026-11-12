import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultEnabledLayers,
  getEnabledLayers,
  isDebugLogging,
  isLayerEnabled,
  resetEnabledLayers,
  setDebugLogging,
  setEnabledLayers,
  setLayerEnabled,
  subscribeLoggerConfig,
} from "../../sincpro_mobile/infrastructure/logger.ts";

test("while debugging every layer speaks by default; the person turns layers off", () => {
  resetEnabledLayers();
  assert.deepEqual(getEnabledLayers(), defaultEnabledLayers());
  assert.equal(isLayerEnabled("adapter"), true);
  assert.equal(isLayerEnabled("infrastructure"), true);
  assert.equal(isLayerEnabled("feature"), true);
});

test("setLayerEnabled flips one layer and notifies subscribers", () => {
  resetEnabledLayers();
  let ticks = 0;
  const stop = subscribeLoggerConfig(() => {
    ticks += 1;
  });

  setLayerEnabled("adapter", false);
  assert.equal(isLayerEnabled("adapter"), false);
  assert.equal(ticks, 1);

  setLayerEnabled("adapter", false);
  assert.equal(ticks, 1, "identical writes stay quiet");

  stop();
  setLayerEnabled("adapter", true);
  assert.equal(ticks, 1);
});

test("setEnabledLayers patches several layers at once", () => {
  resetEnabledLayers();
  setEnabledLayers({ adapter: false, feature: false });

  const snapshot = getEnabledLayers();
  assert.equal(snapshot.adapter, false);
  assert.equal(snapshot.feature, false);
  assert.equal(snapshot.bounded_context, true);

  resetEnabledLayers();
  assert.deepEqual(getEnabledLayers(), defaultEnabledLayers());
});

test("master console switch notifies independently of layer masks", () => {
  setDebugLogging(false);
  let ticks = 0;
  const stop = subscribeLoggerConfig(() => {
    ticks += 1;
  });

  setDebugLogging(true);
  assert.equal(isDebugLogging(), true);
  assert.equal(ticks, 1);

  setDebugLogging(true);
  assert.equal(ticks, 1);

  setDebugLogging(false);
  stop();
});
