import assert from "node:assert/strict";
import test from "node:test";

import { trace } from "@opentelemetry/api";
import { ExportResultCode } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { BasicTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import {
  BoundedContext,
  Command,
  configureProcess,
  Feature,
  logger,
  loggerAdapter,
} from "@sincpro/client-framework";
import { memoryTracer } from "@sincpro/client-framework/testing";

import {
  configureLogger,
  mobileLogger,
  setDebugLogging,
  setLayerEnabled,
} from "../../sincpro_mobile/infrastructure/logger.ts";
import type { LogQueueRepository } from "../../sincpro_mobile/infrastructure/telemetry/logging/log_queue_repository.ts";
import {
  _resetLogShipping,
  initLogShipping,
} from "../../sincpro_mobile/infrastructure/telemetry/logging/loki_registry.ts";

// ---------------------------------------------------------------------------
// What the logger ships: every line it lets speak is stored for Loki (`shipLog`)
// ---------------------------------------------------------------------------

interface ShippedLine {
  level: string;
  line: string;
}

// Flush all pending queueMicrotask callbacks
async function flushMicrotasks() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/**
 * The app's logger with Loki on, capturing what it stores to ship — production (the defaults)
 * unless `debugging`.
 */
function setupViaInit(debugging = false): {
  lines(): ShippedLine[];
  teardown(): void;
} {
  const shipped: ShippedLine[] = [];
  initLogShipping(
    {
      enqueue: async (level: string, line: string) => void shipped.push({ level, line }),
    } as unknown as LogQueueRepository,
    () => undefined,
  );
  configureLogger({ production: {}, debug: {} });
  setDebugLogging(debugging);
  configureProcess({ logger: { engine: mobileLogger } });
  return {
    lines: () => [...shipped],
    teardown() {
      setDebugLogging(false);
      configureLogger({ production: {}, debug: {} });
      _resetLogShipping();
    },
  };
}

/** A use case of `name` that writes `message` at `level`. */
async function speakFrom(name: string, level: "debug" | "info", message: string) {
  class CommandSpeak extends Command<void> {}
  const boundedContext = new BoundedContext(name);
  boundedContext.feature(CommandSpeak)(
    class Speak extends Feature<CommandSpeak, void> {
      execute(): void {
        this.logger[level](message);
      }
    },
  );
  await boundedContext.execute(new CommandSpeak());
}

const has = (lines: ShippedLine[], text: string) => lines.some((l) => l.line.includes(text));

// ---------------------------------------------------------------------------
// Production — what the app ships normally
// ---------------------------------------------------------------------------

test("logger: an error or a warning from a quiet layer (adapter) still ships", async () => {
  const { teardown, lines } = setupViaInit();
  try {
    loggerAdapter.error("Odoo API returned 503");
    loggerAdapter.warn("slow query detected");
    await flushMicrotasks();
    assert.ok(has(lines(), "Odoo API returned 503"), JSON.stringify(lines()));
    assert.ok(has(lines(), "slow query detected"), JSON.stringify(lines()));
  } finally {
    teardown();
  }
});

test("logger: in production the app's own lines ship; common's, adapter's and infrastructure's do not", async () => {
  const { teardown, lines } = setupViaInit();
  try {
    await speakFrom("sales", "info", "order synced");
    await speakFrom("common", "info", "network is up");
    loggerAdapter.info("fetching routes");
    logger.info("database ready");
    await flushMicrotasks();
    const shipped = lines();
    assert.ok(has(shipped, "order synced"), JSON.stringify(shipped));
    assert.ok(!has(shipped, "network is up"), "common is quiet");
    assert.ok(!has(shipped, "fetching routes"), "adapter is quiet");
    assert.ok(!has(shipped, "database ready"), "infrastructure is quiet");
  } finally {
    teardown();
  }
});

test("logger: in production debug ships only when the app's level says so", async () => {
  const { teardown, lines } = setupViaInit();
  try {
    await speakFrom("sales", "debug", "cart recomputed");
    await flushMicrotasks();
    assert.ok(!has(lines(), "cart recomputed"), "info by default");

    configureLogger({ production: { level: "debug" } });
    await speakFrom("sales", "debug", "cart recomputed again");
    await flushMicrotasks();
    assert.ok(has(lines(), "cart recomputed again"), JSON.stringify(lines()));
  } finally {
    teardown();
  }
});

test("logger: at level 'warn', info stays out and problems still go", async () => {
  const { teardown, lines } = setupViaInit();
  try {
    configureLogger({ production: { level: "warn" } });
    await speakFrom("sales", "info", "order synced quietly");
    logger.warn("slow sync");
    await flushMicrotasks();
    assert.ok(!has(lines(), "order synced quietly"), JSON.stringify(lines()));
    assert.ok(has(lines(), "slow sync"), JSON.stringify(lines()));
  } finally {
    teardown();
  }
});

test("logger: the app names what is quiet — a bounded context, a layer", async () => {
  const { teardown, lines } = setupViaInit();
  try {
    configureLogger({
      production: {
        boundedContexts: { sales: false, common: true },
        layers: { adapter: true },
      },
    });
    await speakFrom("sales", "info", "sales line");
    await speakFrom("common", "info", "common line");
    loggerAdapter.info("adapter line");
    await flushMicrotasks();
    assert.ok(!has(lines(), "sales line"));
    assert.ok(has(lines(), "common line"));
    assert.ok(has(lines(), "adapter line"));
  } finally {
    teardown();
  }
});

// ---------------------------------------------------------------------------
// Debugging — a debug build, or the person's switch
// ---------------------------------------------------------------------------

test("logger: debugging, every line speaks but the layers the person turns off", async () => {
  const { teardown, lines } = setupViaInit(true);
  try {
    await speakFrom("common", "debug", "network checked");
    loggerAdapter.info("fetching routes");
    logger.debug("database ready");
    setLayerEnabled("adapter", false);
    loggerAdapter.info("adapter turned off");
    await flushMicrotasks();
    const shipped = lines();
    assert.ok(has(shipped, "network checked"), JSON.stringify(shipped));
    assert.ok(has(shipped, "fetching routes"));
    assert.ok(has(shipped, "database ready"));
    assert.ok(!has(shipped, "adapter turned off"), "the person turned adapters off");
  } finally {
    setLayerEnabled("adapter", true);
    teardown();
  }
});

test("logger: the layer prefixes the Loki line of an adapter error", async () => {
  const { teardown, lines } = setupViaInit();
  try {
    loggerAdapter.error("connection refused");
    await flushMicrotasks();
    assert.ok(
      lines().some((l) => l.line.startsWith("[adapter] connection refused")),
      JSON.stringify(lines()),
    );
  } finally {
    teardown();
  }
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
  const { teardown, lines } = setupViaInit(true);

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

  logger.info("payment processed");

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
  const { teardown, lines } = setupViaInit(true);

  const { _resetContextManager } =
    await import("../../sincpro_mobile/infrastructure/context_manager/index.ts");
  _resetContextManager();
  logger.info("order created without tracing");
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

class CommandQuote extends Command<number> {
  constructor(readonly quantity: number) {
    super();
  }
}

class Quote extends Feature<CommandQuote, number> {
  static readonly serviceName = "Quote";
  execute(command: CommandQuote): number {
    this.logger.info("quoted", { quantity: command.quantity });
    return command.quantity * 10;
  }
}

test("logger: a line inside a use case carries its layer, use case and the run's trace", async () => {
  const { teardown, lines } = setupViaInit(true);
  const tracer = memoryTracer();
  configureProcess({ tracer, logger: { engine: mobileLogger } });
  const salesBoundedContext = new BoundedContext("sales");
  salesBoundedContext.feature(CommandQuote)(Quote);

  assert.equal(await salesBoundedContext.execute(new CommandQuote(3)), 30);
  await flushMicrotasks();

  const [span] = tracer.spans;
  const quoted = lines().find((l) => l.line.includes("quoted"));
  assert.ok(quoted, `no line for the use case. Got: ${JSON.stringify(lines())}`);
  assert.equal(
    quoted.line,
    `[feature] [sales.Quote] quoted quantity=3 trace_id=${span?.traceId} span_id=${span?.spanId}`,
  );

  teardown();
});
