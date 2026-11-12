import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  BoundedContext,
  Command,
  configureProcess,
  Feature,
  logger,
} from "@sincpro/client-framework";

import { SettingsRepository } from "../../sincpro_mobile/adapters/repositories/setting.repository.ts";
import MIGRATIONS, {
  DATABASE_TABLES,
} from "../../sincpro_mobile/entrypoints/db/migrations.ts";
import { Debug } from "../../sincpro_mobile/infrastructure/debug.ts";
import {
  isConsoleDebug,
  lokiLine,
  mobileLogger,
  setConsoleDebug,
} from "../../sincpro_mobile/infrastructure/logger.ts";
import {
  _resetLokiClient,
  initLokiClient,
} from "../../sincpro_mobile/infrastructure/telemetry/logging/loki_registry.ts";

const root = path.resolve(import.meta.dirname, "../..");

test("a Loki line says who and, for an unexpected failure, what, where and its stack", () => {
  const line = lokiLine({
    timestamp: "2026-11-12T00:45:53.804Z",
    level: "error",
    layer: "feature",
    message:
      "Execution failed: TypeError: server is undefined at SaveServer.execute (x.ts:20:5)",
    useCase: "odoo.SaveServer",
    traceId: "42c69e2d21efec8bd39be90576fe8b8f",
    spanId: "7c6d83f3bf41a453",
    release: "sincpro-mobile-tickets:0.3.0",
    tenant: "acme",
    userId: "7",
    failure: {
      type: "TypeError",
      kind: "internal",
      fault: true,
      message: "server is undefined",
      at: "SaveServer.execute (x.ts:20:5)",
      stack: "TypeError: server is undefined\n    at SaveServer.execute (x.ts:20:5)",
    },
  });
  const [first, ...stack] = line.split("\n");
  for (const key of [
    "[feature] [odoo.SaveServer]",
    "release=sincpro-mobile-tickets:0.3.0",
    "tenant=acme",
    "user_id=7",
    "error_type=TypeError",
    "sincpro_outcome=internal",
    "error_at=SaveServer.execute (x.ts:20:5)",
    "trace_id=42c69e2d21efec8bd39be90576fe8b8f",
  ]) {
    assert.ok(first?.includes(key), `${key} in: ${first}`);
  }
  assert.deepEqual(stack, [
    "TypeError: server is undefined",
    "    at SaveServer.execute (x.ts:20:5)",
  ]);
});

test("the debug switch someone saved wins; never saved, the level the app was built with stays", async () => {
  await MIGRATIONS.find((one) => one.name === DATABASE_TABLES.SETTINGS)!.migrationFn();
  setConsoleDebug(true); // EXPO_PUBLIC_LOG_LEVEL=debug
  await Debug.hydrate();
  assert.equal(isConsoleDebug(), true, "nothing saved: the .env's level stays");

  await SettingsRepository.saveOneSetting("app.debug_mode", false);
  await Debug.hydrate();
  assert.equal(isConsoleDebug(), false, "the person turned it off");
});

test("shipping starts right after the migrations, before the queue, the crons and the hooks run anything", () => {
  const source = readFileSync(
    path.join(root, "sincpro_mobile/framework/createApp.ts"),
    "utf8",
  );
  const start = source.slice(source.indexOf("export async function startApp("));
  const order = [
    "await kernel.bootstrap();",
    "await initTelemetry(telemetry);",
    "await orchestrator.bootstrap();",
  ].map((step) => start.indexOf(step));
  assert.ok(
    order.every((at) => at > 0),
    String(order),
  );
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    order,
  );
});

test("Loki down or no network never fails a use case or the line that tells it", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError("Network request failed");
  };
  initLokiClient({ endpoint: "http://loki.down", labels: { app: "test" } });
  configureProcess({ logger: { engine: mobileLogger } });
  try {
    class CommandProbe extends Command<string> {}
    const probeBoundedContext = new BoundedContext("probe");
    probeBoundedContext.feature(CommandProbe)(
      class Probe extends Feature<CommandProbe, string> {
        execute(): string {
          this.logger.error("something to tell");
          return "answered";
        }
      },
    );
    logger.error("outside a run");
    assert.equal(await probeBoundedContext.execute(new CommandProbe()), "answered");
    await new Promise((resolve) => setTimeout(resolve, 20));
  } finally {
    globalThis.fetch = original;
    _resetLokiClient();
  }
});
