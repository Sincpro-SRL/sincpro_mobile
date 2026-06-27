import { trace } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BasicTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";

import type { SpanQueueRepository } from "./span_queue_repository";
import { SQLiteSpanExporter } from "./sqlite_span_exporter";

let _provider: BasicTracerProvider | null = null;

export interface TracingResourceConfig {
  serviceName?: string;
  serviceVersion?: string;
  deploymentEnvironment?: string;
  /** Extra OTel resource attributes (device.*, os.*, tenant, …). */
  extra?: Record<string, string>;
}

/**
 * @param queue          - repository used by the exporter to buffer spans
 * @param persist        - when false the TracerProvider is registered (decorators work)
 *                         but spans are not written to SQLite; pass true only when an
 *                         OTLP destination is configured and flush is active
 * @param onEnqueued     - called after spans are buffered, so the pipeline can
 *                         opportunistically attempt delivery (store-first)
 * @param resourceConfig - OTel resource attributes; without `serviceName` spans appear
 *                         as `unknown_service` in Grafana/Tempo
 */
export function initTracing(
  queue: SpanQueueRepository,
  persist = true,
  onEnqueued?: () => void,
  resourceConfig?: TracingResourceConfig,
): void {
  _provider?.shutdown().catch(() => {});

  const rawAttrs: Record<string, string> = {};
  if (resourceConfig?.serviceName) rawAttrs["service.name"] = resourceConfig.serviceName;
  if (resourceConfig?.serviceVersion)
    rawAttrs["service.version"] = resourceConfig.serviceVersion;
  if (resourceConfig?.deploymentEnvironment)
    rawAttrs["deployment.environment"] = resourceConfig.deploymentEnvironment;
  if (resourceConfig?.extra) Object.assign(rawAttrs, resourceConfig.extra);

  const resource =
    Object.keys(rawAttrs).length > 0 ? resourceFromAttributes(rawAttrs) : undefined;

  const provider = new BasicTracerProvider({
    resource,
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
