import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const source = readFileSync(
  path.resolve(
    import.meta.dirname,
    "../../sincpro_mobile/ui/components/organisms/InjectableWebView.tsx",
  ),
  "utf8",
);
const body = (name: string) => {
  const start = source.indexOf(`function ${name}(`);
  return source.slice(start, source.indexOf("\n  }\n", start));
};

test("an error's trailing onLoadEnd does not reset the retries", () => {
  // react-native-webview calls onLoadEnd right after onError; resetting there kept the
  // count at 0 and an offline portal reloaded every 2 s forever.
  assert.match(body("handleError"), /failedRef\.current = true;/);
  const loadEnd = body("handleLoadEnd");
  assert.match(
    loadEnd,
    /if \(failedRef\.current\) \{\s*failedRef\.current = false;\s*\} else \{\s*setRetryCount\(0\);/,
  );
});

test("a new error replaces the pending retry instead of stacking another reload", () => {
  const error = body("handleError");
  assert.ok(
    error.indexOf("clearTimeout(errorTimeoutRef.current)") <
      error.indexOf("errorTimeoutRef.current = setTimeout"),
  );
});
