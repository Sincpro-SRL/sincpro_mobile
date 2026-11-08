import assert from "node:assert/strict";
import test from "node:test";

import { dateTimeFormat } from "@sincpro/mobile/tools/utils/intl";

test("date formatters are shared per locale and options; invalid zones still throw", () => {
  const options = { timeZone: "America/La_Paz", hour: "2-digit" } as const;
  assert.equal(dateTimeFormat("en-US", options), dateTimeFormat("en-US", { ...options }));
  assert.notEqual(dateTimeFormat("en-US", options), dateTimeFormat("es-BO", options));
  assert.throws(() => dateTimeFormat("en-US", { timeZone: "Mars/Olympus" }), RangeError);
});
