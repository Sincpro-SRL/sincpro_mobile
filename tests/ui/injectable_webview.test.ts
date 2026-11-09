import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { webViewReloadNotice } from "@sincpro/mobile/ui/components/organisms/InjectableWebView.notices";

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

test("the HTTP cache is on unless a caller still opts out", () => {
  assert.match(source, /useDefaultCache = true,/);
  assert.match(source, /useDefaultCache \? "LOAD_DEFAULT" : "LOAD_NO_CACHE"/);
});

test("a single-page history change does not cover the page nor arm the stuck reload", () => {
  // Android reports every pushState of Odoo as a load start; covering it blanked each menu
  // and the stuck check reloaded the whole client 15 s later.
  const loadStart = body("handleLoadStart");
  assert.ok(
    loadStart.indexOf("if (!blockingRef.current) return;") <
      loadStart.indexOf("setIsLoading(true)"),
  );
  assert.ok(
    loadStart.indexOf("if (!blockingRef.current) return;") <
      loadStart.indexOf("watchStuckLoad()"),
  );
  assert.match(body("handleLoadEnd"), /blockingRef\.current = false;/);
});

test("screens reload through the ref and every reload shows its progress", () => {
  assert.match(
    source,
    /useImperativeHandle\(ref, \(\) => \(\{\s*reload: \(\) => startReload\("reload"\),\s*clearCacheAndReload: \(\) => startReload\("clear-cache"\),/,
  );
  const reload = body("startReload");
  assert.match(reload, /toast\.show\(\{/);
  assert.match(reload, /blockingRef\.current = true;/);
  assert.match(body("handleLoadEnd"), /settleReloadToast\("done"\)/);
  assert.match(body("handleError"), /settleReloadToast\("failed"\)/);
});

test("a page whose process the system ended comes back in a new WebView", () => {
  assert.match(source, /onRenderProcessGone=\{handleProcessGone\}/);
  assert.match(source, /onContentProcessDidTerminate=\{handleProcessGone\}/);
  assert.match(source, /key=\{instance\}/);
  assert.match(body("handleProcessGone"), /setInstance\(\(value\) => value \+ 1\)/);
});

test("the reload notice starts as a process and ends done or failed", () => {
  assert.deepEqual(webViewReloadNotice("reload", "Odoo"), {
    variant: "loading",
    title: "Recargando",
    message: "Odoo",
  });
  assert.equal(
    webViewReloadNotice("clear-cache", "Odoo").message,
    "Descargando Odoo de nuevo",
  );
  assert.equal(webViewReloadNotice("done", "la página").message, "La página");
  assert.equal(webViewReloadNotice("done", "Odoo").duration, 1500);
  assert.equal(webViewReloadNotice("failed", "Odoo").variant, "danger");
});
