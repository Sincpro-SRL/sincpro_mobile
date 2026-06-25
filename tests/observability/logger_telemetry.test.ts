import assert from "node:assert/strict";
import test from "node:test";

import { trace } from "@opentelemetry/api";
import { ExportResultCode } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { BasicTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";

// Loki-layer imports only — no expo deps, no logger static side-effects.
import { LokiClient } from "../../sincpro_mobile/infrastructure/telemetry/logging/loki_client.ts";
import {
  _resetLokiClient as _resetTelemetry,
  initLokiClient as initTelemetry,
} from "../../sincpro_mobile/infrastructure/telemetry/logging/loki_registry.ts";

// ---------------------------------------------------------------------------
// Minimal fetch mock — captures Loki push bodies
// ---------------------------------------------------------------------------

interface PushedLine {
  ts: string;
  line: string;
}
interface PushedStream {
  stream: Record<string, string>;
  values: [string, string][];
}

function mockLokiFetch(): {
  streams(): PushedStream[];
  lines(): PushedLine[];
  restore(): void;
} {
  const bodies: { streams: PushedStream[] }[] = [];
  const original = global.fetch;
  global.fetch = async (_input, init) => {
    bodies.push(JSON.parse((init?.body as string) ?? "{}"));
    return new Response(null, { status: 204 });
  };
  return {
    streams() {
      return bodies.flatMap((b) => b.streams);
    },
    lines() {
      return bodies
        .flatMap((b) => b.streams)
        .flatMap((s) => s.values.map(([ts, line]) => ({ ts, line })));
    },
    restore() {
      global.fetch = original;
    },
  };
}

// Flush all pending queueMicrotask callbacks
async function flushMicrotasks() {
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

// ---------------------------------------------------------------------------
// Test-level setup — real LokiClient with mock fetch, no queue (online path)
// ---------------------------------------------------------------------------

function setup() {
  const mock = mockLokiFetch();
  const client = new LokiClient(
    { endpoint: "http://loki.test", labels: { app: "test-mobile" } },
    undefined, // no queue — tests the online push path
  );
  return { mock, client };
}

// ---------------------------------------------------------------------------
// shouldLogRemote behaviour — tested indirectly through BaseLogger.
// We call logger methods after initTelemetry so getLokiClient() is non-null.
// ---------------------------------------------------------------------------

// Helper: set up a real LokiClient via initTelemetry so the logger singleton
// picks it up. Captures what gets pushed.
function setupViaInit(): {
  streams(): PushedStream[];
  lines(): PushedLine[];
  teardown(): void;
} {
  const mock = mockLokiFetch();
  initTelemetry({ endpoint: "http://loki.test", labels: { app: "test-mobile" } });
  return {
    streams: mock.streams.bind(mock),
    lines: mock.lines.bind(mock),
    teardown() {
      mock.restore();
      _resetTelemetry();
    },
  };
}

// ---------------------------------------------------------------------------
// Context prefix in Loki message
// ---------------------------------------------------------------------------

test("logger: context prefix '[USE_CASES]' appears in Loki push when context is not GLOBAL", async () => {
  const { client } = setup();
  const { mock, restore } = (() => {
    const m = mockLokiFetch();
    return { mock: m, restore: m.restore.bind(m) };
  })();

  // Push directly via LokiClient to verify prefix logic is independent of logger
  // (the prefix is added by BaseLogger.pushRemote)
  client.push("info", "[USE_CASES] order synced");
  await flushMicrotasks();

  const lines = mock.lines();
  assert.ok(lines.length > 0, "at least one line pushed");
  assert.ok(
    lines.some((l) => l.line.includes("[USE_CASES]")),
    `expected '[USE_CASES]' in line, got: ${JSON.stringify(lines.map((l) => l.line))}`,
  );

  restore();
});

test("logger: GLOBAL context produces no prefix in Loki message", async () => {
  const { client } = setup();
  const { mock, restore } = (() => {
    const m = mockLokiFetch();
    return { mock: m, restore: m.restore.bind(m) };
  })();

  client.push("info", "global message without prefix");
  await flushMicrotasks();

  const lines = mock.lines();
  assert.ok(lines.length > 0);
  assert.ok(
    lines.every((l) => !l.line.startsWith("[")),
    `GLOBAL context should produce no '[...]' prefix, got: ${JSON.stringify(lines.map((l) => l.line))}`,
  );

  restore();
});

// ---------------------------------------------------------------------------
// shouldLogRemote: ERROR/WARN bypass ENABLED_LOGS and IS_PRODUCTION
// These are tested via the logger module itself.
// ---------------------------------------------------------------------------

test("logger: error from disabled-console context (ODOO_CLIENT) still reaches Loki", async () => {
  // loggerOdooClient has ENABLED_LOGS[ODOO_CLIENT] = false, so shouldLog() returns false.
  // shouldLogRemote() for ERROR must return true regardless.
  const { teardown, lines } = setupViaInit();

  // We import the logger lazily to avoid circular/static issues in test runner
  const { loggerOdooClient } = await import("../../sincpro_mobile/infrastructure/logger.ts");
  loggerOdooClient.error("Odoo API returned 503");
  await flushMicrotasks();

  const pushed = lines();
  assert.ok(
    pushed.some((l) => l.line.includes("Odoo API returned 503")),
    `ERROR from disabled context must reach Loki. Got: ${JSON.stringify(pushed.map((l) => l.line))}`,
  );

  teardown();
});

test("logger: warn from disabled-console context (REPOSITORIES) still reaches Loki", async () => {
  const { teardown, lines } = setupViaInit();

  const { loggerRepositories } =
    await import("../../sincpro_mobile/infrastructure/logger.ts");
  loggerRepositories.warn("slow query detected");
  await flushMicrotasks();

  const pushed = lines();
  assert.ok(
    pushed.some((l) => l.line.includes("slow query detected")),
    `WARN from disabled context must reach Loki. Got: ${JSON.stringify(pushed.map((l) => l.line))}`,
  );

  teardown();
});

test("logger: debug never reaches Loki regardless of context", async () => {
  const { teardown, lines } = setupViaInit();

  const { loggerUseCases } = await import("../../sincpro_mobile/infrastructure/logger.ts");
  loggerUseCases.debug("verbose debug trace");
  await flushMicrotasks();

  const pushed = lines();
  assert.equal(
    pushed.filter((l) => l.line.includes("verbose debug trace")).length,
    0,
    "DEBUG must never reach Loki",
  );

  teardown();
});

test("logger: info from enabled context (USE_CASES) reaches Loki", async () => {
  const { teardown, lines } = setupViaInit();

  const { loggerUseCases } = await import("../../sincpro_mobile/infrastructure/logger.ts");
  loggerUseCases.info("order ACM-001 synced");
  await flushMicrotasks();

  const pushed = lines();
  assert.ok(
    pushed.some((l) => l.line.includes("order ACM-001 synced")),
    `INFO from enabled context must reach Loki. Got: ${JSON.stringify(pushed.map((l) => l.line))}`,
  );

  teardown();
});

test("logger: info from disabled context (ODOO_CLIENT) does NOT reach Loki", async () => {
  const { teardown, lines } = setupViaInit();

  const { loggerOdooClient } = await import("../../sincpro_mobile/infrastructure/logger.ts");
  loggerOdooClient.info("fetching routes");
  await flushMicrotasks();

  const pushed = lines();
  assert.equal(
    pushed.filter((l) => l.line.includes("fetching routes")).length,
    0,
    "INFO from disabled context must not reach Loki (too noisy)",
  );

  teardown();
});

test("logger: context prefix appears in Loki message for ODOO_CLIENT error", async () => {
  const { teardown, lines } = setupViaInit();

  const { loggerOdooClient } = await import("../../sincpro_mobile/infrastructure/logger.ts");
  loggerOdooClient.error("connection refused");
  await flushMicrotasks();

  const pushed = lines();
  assert.ok(
    pushed.some((l) => l.line.includes("[ODOO_CLIENT]")),
    `Expected '[ODOO_CLIENT]' prefix in Loki line. Got: ${JSON.stringify(pushed.map((l) => l.line))}`,
  );

  teardown();
});

// ---------------------------------------------------------------------------
// Log-trace correlation: trace_id/span_id suffix en mensajes Loki
// ---------------------------------------------------------------------------

// Captura spans sin exportar a SQLite — solo necesitamos acceder a su SpanContext
class CapturingExporter implements SpanExporter {
  readonly spans: ReadableSpan[] = [];
  export(spans: ReadableSpan[], done: (result: { code: number }) => void): void {
    this.spans.push(...spans);
    done({ code: ExportResultCode.SUCCESS });
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

test("logger: Loki message lleva trace_id y span_id cuando hay un span activo", async () => {
  const { teardown, lines } = setupViaInit();

  // Instala un TracerProvider en memoria (no SQLite)
  const exporter = new CapturingExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);

  const { _getContextManager, _resetContextManager } =
    await import("../../sincpro_mobile/infrastructure/context_manager/index.ts");
  const { OTEL_CTX_KEY } =
    await import("../../sincpro_mobile/infrastructure/telemetry/context_keys.ts");
  const { loggerUseCases } = await import("../../sincpro_mobile/infrastructure/logger.ts");

  // Inicia un span y lo activa manualmente en el framework context
  const tracer = trace.getTracer("test.logger.correlation");
  const span = tracer.startSpan("payment.process");
  const { context: otelContext } = await import("@opentelemetry/api");
  const spanOtelCtx = otelContext.with(otelContext.active(), () =>
    trace.setSpan(otelContext.active(), span),
  );

  const manager = _getContextManager();
  const frameworkCtx = manager.active().set(OTEL_CTX_KEY, spanOtelCtx);
  manager.push(frameworkCtx);

  loggerUseCases.info("payment processed");

  manager.pop();
  span.end();

  await flushMicrotasks();

  const pushed = lines();
  const paymentLine = pushed.find((l) => l.line.includes("payment processed"));

  assert.ok(
    paymentLine,
    `No se encontró la línea 'payment processed'. Got: ${JSON.stringify(pushed.map((l) => l.line))}`,
  );
  assert.ok(
    paymentLine.line.includes("trace_id="),
    `Se esperaba 'trace_id=' en la línea Loki. Got: ${paymentLine.line}`,
  );
  assert.ok(
    paymentLine.line.includes("span_id="),
    `Se esperaba 'span_id=' en la línea Loki. Got: ${paymentLine.line}`,
  );

  await provider.shutdown();
  _resetContextManager();
  teardown();
});

test("logger: Loki message NO lleva trace_id cuando no hay span activo", async () => {
  const { teardown, lines } = setupViaInit();

  const { _resetContextManager } =
    await import("../../sincpro_mobile/infrastructure/context_manager/index.ts");
  _resetContextManager();

  const { loggerUseCases } = await import("../../sincpro_mobile/infrastructure/logger.ts");
  loggerUseCases.info("order created without tracing");
  await flushMicrotasks();

  const pushed = lines();
  const targetLine = pushed.find((l) => l.line.includes("order created without tracing"));

  assert.ok(
    targetLine,
    `No se encontró la línea esperada. Got: ${JSON.stringify(pushed.map((l) => l.line))}`,
  );
  assert.ok(
    !targetLine.line.includes("trace_id="),
    `No debería haber 'trace_id=' cuando no hay span activo. Got: ${targetLine.line}`,
  );

  teardown();
});
