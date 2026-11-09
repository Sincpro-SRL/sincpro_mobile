import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { createReconnector } from "@sincpro/mobile/infrastructure/print/reconnect";

const DELAYS = [10, 20, 30];

/** Lets the awaited attempt and the code after it run. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function fakeAttempt(results: boolean[]) {
  const calls: number[] = [];
  const attempt = async () => {
    calls.push(Date.now());
    return results.shift() ?? false;
  };
  return { attempt, calls };
}

test("tries at once and stops when the printer is back", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    const { attempt, calls } = fakeAttempt([false, true]);
    createReconnector(attempt, DELAYS).start();
    await settle();
    assert.equal(calls.length, 1, "the first try does not wait");
    mock.timers.tick(10);
    await settle();
    assert.equal(calls.length, 2);
    mock.timers.tick(1_000);
    await settle();
    assert.equal(calls.length, 2, "nothing more once connected");
  } finally {
    mock.timers.reset();
  }
});

test("backs off on each failure and gives up after the last delay", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    const { attempt, calls } = fakeAttempt([]);
    createReconnector(attempt, DELAYS).start();
    await settle();
    for (const delay of DELAYS) {
      mock.timers.tick(delay - 1);
      await settle();
      const before = calls.length;
      mock.timers.tick(1);
      await settle();
      assert.equal(calls.length, before + 1, `waits ${delay} ms before the next try`);
    }
    mock.timers.tick(10_000);
    await settle();
    assert.equal(calls.length, DELAYS.length + 1, "a printer that stays off is left alone");
  } finally {
    mock.timers.reset();
  }
});

test("stop cancels the pending try, as when the user disconnects", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    const { attempt, calls } = fakeAttempt([]);
    const reconnector = createReconnector(attempt, DELAYS);
    reconnector.start();
    await settle();
    reconnector.stop();
    mock.timers.tick(1_000);
    await settle();
    assert.equal(calls.length, 1);
  } finally {
    mock.timers.reset();
  }
});

test("a start during a try runs again after it, never two at once", async () => {
  let release: (value: boolean) => void = () => {};
  let running = 0;
  let maxRunning = 0;
  let calls = 0;
  const attempt = () => {
    calls += 1;
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    return new Promise<boolean>((resolve) => {
      release = (value) => {
        running -= 1;
        resolve(value);
      };
    });
  };
  const reconnector = createReconnector(attempt, DELAYS);
  reconnector.start();
  reconnector.start();
  assert.equal(calls, 1);
  release(true);
  await settle();
  assert.equal(calls, 2, "the second start runs once the first try ends");
  release(true);
  await settle();
  assert.equal(maxRunning, 1);
});

test("a failed print tells the user before it goes to the failed queue", async () => {
  const { readFileSync } = await import("node:fs");
  const path = await import("node:path");
  const source = readFileSync(
    path.resolve(
      import.meta.dirname,
      "../../sincpro_mobile/entrypoints/queue/printImage.subscriber.ts",
    ),
    "utf8",
  );
  const failed = source.slice(source.indexOf("if (!printed)"));
  assert.ok(failed.indexOf('name: "printer.print_failed"') < failed.indexOf("throw new"));
});
