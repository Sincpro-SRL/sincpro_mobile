import assert from "node:assert/strict";
import { test } from "node:test";

import { processIdentity } from "@sincpro/client-framework";

import {
  instrumentObservability,
  processObservability,
} from "../../sincpro_mobile/infrastructure/observability.ts";

test("one option instruments everything, each signal saying who sent it", () => {
  const initialized: Record<string, unknown>[] = [];
  const observability = instrumentObservability({
    environment: "production",
    traces: { endpoint: "https://otlp.test", headers: { apikey: "k" } },
    logs: { endpoint: "https://loki.test", headers: { apikey: "k" }, level: "debug" },
    errors: (app) => {
      initialized.push({
        release: app.release,
        dist: app.build,
        environment: app.environment,
      });
      return { captureException: () => "id" };
    },
  });

  const { app, telemetry, reporter } = observability;
  assert.equal(app.release, `${app.name}:${app.version}`, "sincpro_framework's release");
  assert.deepEqual(initialized, [
    { release: app.release, dist: app.build, environment: "production" },
  ]);
  assert.ok(reporter, "the app's client becomes the process's reporter");
  assert.equal(telemetry?.serviceName, app.name);
  assert.equal(telemetry?.serviceVersion, app.version);
  assert.equal(telemetry?.resourceAttributes?.release, app.release);
  assert.deepEqual(telemetry?.otlp, {
    endpoint: "https://otlp.test",
    headers: { apikey: "k" },
  });
  assert.deepEqual(telemetry?.loki?.labels, {
    app: app.name,
    service_name: app.name,
    env: "production",
    version: app.version,
  });
  assert.equal(processObservability(), observability, "the background flush reads the same");
  assert.deepEqual(
    {
      release: processIdentity()?.release,
      serviceName: processIdentity()?.serviceName,
      serviceVersion: processIdentity()?.serviceVersion,
      tenant: processIdentity()?.tenant,
    },
    {
      release: app.release,
      serviceName: app.name,
      serviceVersion: app.version,
      tenant: undefined,
    },
    "client-framework puts the release on every span, line and report — no tenant on an open app",
  );
  assert.equal(telemetry?.resourceAttributes?.tenant, undefined);
});

test("a deployment that serves a tenant says it on the traces, the labels and every signal", () => {
  const { telemetry } = instrumentObservability({
    tenant: "acme",
    traces: { endpoint: "https://otlp.test" },
    logs: { endpoint: "https://loki.test" },
  });
  assert.equal(processIdentity()?.tenant, "acme");
  assert.equal(telemetry?.resourceAttributes?.tenant, "acme");
  assert.equal(telemetry?.loki?.labels.tenant, "acme");
});

test("without an endpoint nothing is shipped, and without a client nothing is reported", () => {
  const observability = instrumentObservability({ logs: { level: "warn" } });
  assert.equal(observability.telemetry, undefined);
  assert.equal(observability.reporter, undefined);
});
