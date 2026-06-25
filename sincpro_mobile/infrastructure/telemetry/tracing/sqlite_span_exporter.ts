import type { ExportResult } from "@opentelemetry/core";
import { ExportResultCode } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";

import type { SpanQueueRepository } from "./span_queue_repository.ts";
import { serializeSpan } from "./span_serializer.ts";

/**
 * OTel SpanExporter that persists spans to SQLite instead of sending them
 * directly over the network. The flush cron drains the queue when online.
 *
 * Pass `enabled: false` to register the provider without storing anything —
 * useful when tracing is initialized but no OTLP destination is configured yet.
 *
 * Fire-and-forget: export() never blocks the instrumented code path.
 * Failures are swallowed — a span dropped from the queue is preferable to
 * crashing the application.
 */
export class SQLiteSpanExporter implements SpanExporter {
  private readonly queue: SpanQueueRepository;
  private readonly enabled: boolean;
  private readonly onEnqueued?: () => void;

  /**
   * @param onEnqueued - called after spans are persisted, so the pipeline can
   *   opportunistically attempt delivery (store-first, then try to send).
   */
  constructor(queue: SpanQueueRepository, enabled = true, onEnqueued?: () => void) {
    this.queue = queue;
    this.enabled = enabled;
    this.onEnqueued = onEnqueued;
  }

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    if (!this.enabled) {
      resultCallback({ code: ExportResultCode.SUCCESS });
      return;
    }

    const persist = async () => {
      for (const span of spans) {
        await this.queue.enqueue(serializeSpan(span));
      }
    };

    persist()
      .then(() => {
        this.onEnqueued?.();
        resultCallback({ code: ExportResultCode.SUCCESS });
      })
      .catch(() => resultCallback({ code: ExportResultCode.FAILED }));
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
