import assert from "node:assert/strict";
import test from "node:test";

import { onceUntilFailure } from "@sincpro/mobile/tools/utils/once";

test("concurrent and later callers share one run", async () => {
  let runs = 0;
  const start = onceUntilFailure(async () => {
    runs += 1;
    return "ready";
  });
  assert.deepEqual(await Promise.all([start(), start()]), ["ready", "ready"]);
  assert.equal(await start(), "ready");
  assert.equal(runs, 1);
});

test("a failure is reported to its callers and the next call retries", async () => {
  let runs = 0;
  const start = onceUntilFailure(async () => {
    runs += 1;
    if (runs === 1) throw new Error("offline");
    return runs;
  });
  const [first, second] = await Promise.allSettled([start(), start()]);
  assert.equal(first.status, "rejected");
  assert.equal(second.status, "rejected");
  assert.equal(await start(), 2);
  assert.equal(await start(), 2);
});
