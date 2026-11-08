import assert from "node:assert/strict";
import test from "node:test";

import { withCleanup } from "@sincpro/mobile/tools/utils/async";

test("withCleanup behaves like try/finally for async tasks", async () => {
  const log: string[] = [];
  assert.equal(
    await withCleanup(
      async () => "ok",
      () => log.push("clean"),
    ),
    "ok",
  );
  await assert.rejects(
    withCleanup(
      async () => {
        throw new Error("boom");
      },
      () => log.push("clean after error"),
    ),
    /boom/,
  );
  assert.deepEqual(log, ["clean", "clean after error"]);
});

test("a synchronous task is cleaned up in the same tick", () => {
  const log: string[] = [];
  assert.equal(
    withCleanup(
      () => 7,
      () => log.push("clean"),
    ),
    7,
  );
  assert.deepEqual(log, ["clean"]);
  assert.throws(
    () =>
      withCleanup(
        () => {
          throw new Error("sync");
        },
        () => log.push("clean sync error"),
      ),
    /sync/,
  );
  assert.deepEqual(log, ["clean", "clean sync error"]);
});
