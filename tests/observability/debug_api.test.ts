import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ENABLED_LOGS,
  EApplicationLogger,
  getEnabledLoggers,
  isConsoleDebug,
  isLoggerEnabled,
  resetEnabledLoggers,
  setConsoleDebug,
  setEnabledLoggers,
  setLoggerEnabled,
  subscribeLoggerConfig,
} from "../../sincpro_mobile/infrastructure/logger.ts";

test("logger contexts start from the quiet defaults", () => {
  resetEnabledLoggers();
  assert.deepEqual(getEnabledLoggers(), DEFAULT_ENABLED_LOGS);
  assert.equal(isLoggerEnabled(EApplicationLogger.ODOO_CLIENT), false);
  assert.equal(isLoggerEnabled(EApplicationLogger.USE_CASES), true);
});

test("setLoggerEnabled flips one context and notifies subscribers", () => {
  resetEnabledLoggers();
  let ticks = 0;
  const stop = subscribeLoggerConfig(() => {
    ticks += 1;
  });

  setLoggerEnabled(EApplicationLogger.ODOO_CLIENT, true);
  assert.equal(isLoggerEnabled(EApplicationLogger.ODOO_CLIENT), true);
  assert.equal(ticks, 1);

  setLoggerEnabled(EApplicationLogger.ODOO_CLIENT, true);
  assert.equal(ticks, 1, "identical writes stay quiet");

  stop();
  setLoggerEnabled(EApplicationLogger.ODOO_CLIENT, false);
  assert.equal(ticks, 1);
});

test("setEnabledLoggers patches several contexts at once", () => {
  resetEnabledLoggers();
  setEnabledLoggers({
    [EApplicationLogger.ADAPTER]: true,
    [EApplicationLogger.REPOSITORIES]: true,
    [EApplicationLogger.USE_CASES]: false,
  });

  const snapshot = getEnabledLoggers();
  assert.equal(snapshot[EApplicationLogger.ADAPTER], true);
  assert.equal(snapshot[EApplicationLogger.REPOSITORIES], true);
  assert.equal(snapshot[EApplicationLogger.USE_CASES], false);
  assert.equal(snapshot[EApplicationLogger.QUEUE_PROCESSOR], true);

  resetEnabledLoggers();
  assert.deepEqual(getEnabledLoggers(), DEFAULT_ENABLED_LOGS);
});

test("master console switch notifies independently of logger masks", () => {
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
