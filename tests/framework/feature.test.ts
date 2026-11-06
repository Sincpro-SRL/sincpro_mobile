import assert from "node:assert/strict";
import test from "node:test";

import { trace } from "@opentelemetry/api";
import type { ExportResult } from "@opentelemetry/core";
import { ExportResultCode } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { BasicTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ApplicationService, Feature } from "@sincpro/mobile/framework/feature";
import { _resetContextManager } from "@sincpro/mobile/infrastructure/context_manager";
import { _resetTracing } from "@sincpro/mobile/infrastructure/telemetry/tracing/tracer";

class CapturingExporter implements SpanExporter {
  readonly finished: ReadableSpan[] = [];
  constructor(private readonly failOnExport = false) {}
  export(spans: ReadableSpan[], done: (result: ExportResult) => void): void {
    if (this.failOnExport) throw new Error("collector down");
    this.finished.push(...spans);
    done({ code: ExportResultCode.SUCCESS });
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

function setupTracing(failOnExport = false) {
  const exporter = new CapturingExporter(failOnExport);
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);
  return {
    exporter,
    teardown() {
      provider.shutdown().catch(() => {});
      _resetTracing();
      _resetContextManager();
    },
  };
}

class LoadOrders extends Feature<{ repository: { all: () => string[] } }> {
  async load() {
    return this.deps.repository.all();
  }
}

const features = { loadOrders: new LoadOrders({ repository: { all: () => ["ord-1"] } }) };

class PullRoute extends ApplicationService<typeof features> {
  async run() {
    return this.features.loadOrders.load();
  }
}

test("Feature: a public method opens one span; a helper does not", async () => {
  const { exporter, teardown } = setupTracing();
  try {
    class GetCustomers extends Feature {
      async execute(id: string) {
        return this._load(id);
      }
      _load(id: string) {
        return { id };
      }
    }
    assert.deepEqual(await new GetCustomers().execute("cust-1"), { id: "cust-1" });
    assert.deepEqual(
      exporter.finished.map((span) => span.name),
      ["GetCustomers.execute"],
    );
  } finally {
    teardown();
  }
});

test("Feature: a thrown error is recorded and the span ends in ERROR", async () => {
  const { exporter, teardown } = setupTracing();
  try {
    class Charge extends Feature {
      async execute() {
        throw new Error("card declined");
      }
    }
    await assert.rejects(() => new Charge().execute(), /card declined/);
    assert.equal(exporter.finished.length, 1);
    assert.equal(exporter.finished[0].status.code, 2);
    assert.ok(exporter.finished[0].events.some((event) => event.name === "exception"));
  } finally {
    teardown();
  }
});

test("ApplicationService: a feature of its context is a child of the same trace", async () => {
  const { exporter, teardown } = setupTracing();
  try {
    const orders = await new PullRoute(features).run();
    assert.deepEqual(orders, ["ord-1"]);

    const parent = exporter.finished.find((span) => span.name === "PullRoute.run");
    const child = exporter.finished.find((span) => span.name === "LoadOrders.load");
    assert.ok(parent);
    assert.ok(child);
    assert.equal(child!.parentSpanContext?.spanId, parent!.spanContext().spanId);
    assert.equal(child!.spanContext().traceId, parent!.spanContext().traceId);
  } finally {
    teardown();
  }
});

test("Feature: without a tracer, and with an exporter that throws, the use case still runs", async () => {
  const plain = await new LoadOrders({ repository: { all: () => ["local"] } }).load();
  assert.deepEqual(plain, ["local"]);

  const { teardown } = setupTracing(true);
  try {
    const orders = await new PullRoute(features).run();
    assert.deepEqual(orders, ["ord-1"]);
  } finally {
    teardown();
  }
});
