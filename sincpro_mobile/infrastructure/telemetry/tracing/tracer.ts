import { trace } from "@opentelemetry/api";
import { BasicTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";

import type { SpanQueueRepository } from "./span_queue_repository.ts";
import { SQLiteSpanExporter } from "./sqlite_span_exporter.ts";

let _provider: BasicTracerProvider | null = null;

/**
 * @param queue - repository used by the exporter to buffer spans
 * @param persist - when false the TracerProvider is registered (decorators work)
 *                  but spans are not written to SQLite; pass true only when an
 *                  OTLP destination is configured and flush is active
 * @param onEnqueued - called after spans are buffered, so the pipeline can
 *                  opportunistically attempt delivery (store-first)
 */
export function initTracing(
  queue: SpanQueueRepository,
  persist = true,
  onEnqueued?: () => void,
): void {
  _provider?.shutdown().catch(() => {});

  const provider = new BasicTracerProvider({
    spanProcessors: [
      new SimpleSpanProcessor(new SQLiteSpanExporter(queue, persist, onEnqueued)),
    ],
  });
  trace.setGlobalTracerProvider(provider);

  _provider = provider;
}

/** @internal — test use only */
export function _resetTracing(): void {
  _provider?.shutdown().catch(() => {});
  _provider = null;
  trace.disable();
}

export function getTracer(name: string) {
  return trace.getTracer(name);
}
