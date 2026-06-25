import assert from "node:assert/strict";
import test from "node:test";

import { trace } from "@opentelemetry/api";
import type { ExportResult } from "@opentelemetry/core";
import { ExportResultCode } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { BasicTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";

import { _resetContextManager } from "../../sincpro_mobile/infrastructure/context_manager/index.ts";
import { interceptClass } from "../../sincpro_mobile/infrastructure/interceptor/intercept.ts";
import { _resetTracing } from "../../sincpro_mobile/infrastructure/telemetry/tracing/tracer.ts";
import { tracingHooks } from "../../sincpro_mobile/infrastructure/telemetry/tracing/tracing_hooks.ts";

class CapturingExporter implements SpanExporter {
  readonly finished: ReadableSpan[] = [];
  export(spans: ReadableSpan[], done: (result: ExportResult) => void): void {
    this.finished.push(...spans);
    done({ code: ExportResultCode.SUCCESS });
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

function setupTracing() {
  const exporter = new CapturingExporter();
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

// span created per call
test("tracingHooks: creates one span per method call", async () => {
  const { exporter, teardown } = setupTracing();
  try {
    class OrderRepository {
      async findById(_id: string) {
        return { id: _id };
      }
    }
    interceptClass(OrderRepository, tracingHooks("sincpro.mobile.orders"));
    await new OrderRepository().findById("ord-1");
    assert.equal(exporter.finished.length, 1);
    assert.equal(exporter.finished[0].name, "OrderRepository.findById");
  } finally {
    teardown();
  }
});

// error recording — exceptions must land on the span with ERROR status
test("tracingHooks: records exception and sets ERROR status on thrown error", async () => {
  const { exporter, teardown } = setupTracing();
  try {
    class PaymentService {
      async charge() {
        throw new Error("card declined");
      }
    }
    interceptClass(PaymentService, tracingHooks("sincpro.mobile.payments"));
    await assert.rejects(() => new PaymentService().charge(), /card declined/);

    assert.equal(exporter.finished.length, 1);
    const span = exporter.finished[0];
    assert.equal(span.status.code, 2); // SpanStatusCode.ERROR
    assert.ok(
      span.events.find((e) => e.name === "exception"),
      "exception event must be recorded",
    );
  } finally {
    teardown();
  }
});

// parent-child — nested awaited calls must produce correct parent-child linkage
test("tracingHooks: nested awaited calls produce correct parent-child spans", async () => {
  const { exporter, teardown } = setupTracing();
  try {
    class InventoryRepository {
      async reserve(_itemId: string) {
        return true;
      }
    }
    class CheckoutService {
      inventory = new InventoryRepository();
      async placeOrder(itemId: string) {
        return this.inventory.reserve(itemId);
      }
    }
    interceptClass(InventoryRepository, tracingHooks("sincpro.mobile.checkout"));
    interceptClass(CheckoutService, tracingHooks("sincpro.mobile.checkout"));

    const svc = new CheckoutService();
    svc.inventory = new InventoryRepository();
    await svc.placeOrder("item-42");

    const serviceSpan = exporter.finished.find(
      (s) => s.name === "CheckoutService.placeOrder",
    );
    const repoSpan = exporter.finished.find((s) => s.name === "InventoryRepository.reserve");

    assert.ok(serviceSpan, "CheckoutService.placeOrder span must exist");
    assert.ok(repoSpan, "InventoryRepository.reserve span must exist");
    assert.equal(
      repoSpan!.parentSpanContext?.spanId,
      serviceSpan!.spanContext().spanId,
      "repository span must be parented to service span",
    );
  } finally {
    teardown();
  }
});

// sync methods also get spans
test("tracingHooks: records span for synchronous methods", () => {
  const { exporter, teardown } = setupTracing();
  try {
    class TaxCalculator {
      compute(amount: number) {
        return amount * 0.13;
      }
    }
    interceptClass(TaxCalculator, tracingHooks("sincpro.mobile.billing"));
    const result = new TaxCalculator().compute(100);
    assert.equal(result, 13);
    assert.equal(exporter.finished.length, 1);
    assert.equal(exporter.finished[0].name, "TaxCalculator.compute");
  } finally {
    teardown();
  }
});
