import type { Attributes, Span, SpanContext } from "@opentelemetry/api";
import { ROOT_CONTEXT as OTEL_ROOT, SpanStatusCode, trace } from "@opentelemetry/api";
import {
  _getContextManager,
  PropagateContext,
} from "@sincpro/mobile/infrastructure/context_manager/index";
import { interceptClass } from "@sincpro/mobile/infrastructure/interceptor/intercept";

import { bufferStats } from "./buffer_registry";
import { OTEL_CTX_KEY } from "./context_keys";
import { initTelemetry } from "./init_telemetry";
import { activeTraceLabel, getActiveSpanContext } from "./tracing/active_span";
import { getTracer as _getTracer } from "./tracing/tracer";
import { tracingHooks } from "./tracing/tracing_hooks";

// ---------------------------------------------------------------------------
// withSpan — manual span block with automatic lifecycle
// ---------------------------------------------------------------------------

export async function withSpan<T>(
  name: string,
  fn: (span: Span) => T | Promise<T>,
  opts?: { attributes?: Attributes; tracerName?: string },
): Promise<T> {
  const manager = _getContextManager();
  const frameworkCtx = manager.active();
  const otelCtx = frameworkCtx.get(OTEL_CTX_KEY) ?? OTEL_ROOT;

  const tracer = trace.getTracer(opts?.tracerName ?? "sincpro.mobile");
  const span = tracer.startSpan(name, { attributes: opts?.attributes }, otelCtx);

  const newOtelCtx = trace.setSpan(otelCtx, span);
  manager.push(frameworkCtx.set(OTEL_CTX_KEY, newOtelCtx));

  try {
    const result = await Promise.resolve(fn(span));
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    if (error instanceof Error) span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error)?.message });
    throw error;
  } finally {
    span.end();
    manager.pop();
  }
}

// ---------------------------------------------------------------------------
// @Trace — single method decorator
// ---------------------------------------------------------------------------

export interface TraceOptions {
  name?: string;
  attributes?: Attributes;
  tracerName?: string;
}

export function Trace(opts?: TraceOptions) {
  return function (
    target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const original = descriptor.value as (...args: unknown[]) => unknown;
    const className = (target.constructor as { name?: string }).name ?? "";

    descriptor.value = function (this: unknown, ...args: unknown[]): unknown {
      const spanName =
        opts?.name ?? (className ? `${className}.${propertyKey}` : propertyKey);

      const manager = _getContextManager();
      const frameworkCtx = manager.active();
      const otelCtx = frameworkCtx.get(OTEL_CTX_KEY) ?? OTEL_ROOT;
      const tracer = trace.getTracer(opts?.tracerName ?? "sincpro.mobile");
      const span = tracer.startSpan(spanName, { attributes: opts?.attributes }, otelCtx);
      manager.push(frameworkCtx.set(OTEL_CTX_KEY, trace.setSpan(otelCtx, span)));

      let result: unknown;
      try {
        result = original.apply(this, args);
      } catch (error) {
        // Sync method threw before returning — record and clean up immediately.
        if (error instanceof Error) span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error)?.message });
        span.end();
        manager.pop();
        throw error;
      }

      if (result instanceof Promise) {
        return result.then(
          (value) => {
            span.setStatus({ code: SpanStatusCode.OK });
            span.end();
            manager.pop();
            return value;
          },
          (error) => {
            if (error instanceof Error) span.recordException(error);
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: (error as Error)?.message,
            });
            span.end();
            manager.pop();
            throw error;
          },
        );
      }

      // Sync success path.
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      manager.pop();
      return result;
    };

    return descriptor;
  };
}

// ---------------------------------------------------------------------------
// @TraceClass — class decorator: PropagateContext + span per method
// ---------------------------------------------------------------------------

export function TraceClass(tracerName: string) {
  return function <T extends new (...args: never[]) => object>(target: T): T {
    const traced = interceptClass(target, tracingHooks(tracerName));
    return PropagateContext(traced);
  };
}

// ---------------------------------------------------------------------------
// Public facade
// ---------------------------------------------------------------------------

export const Tracing = {
  /** Initializes telemetry (Loki + OTel). Call once at app startup. */
  init: initTelemetry,

  /** Wraps a block of code in a span. Handles start/end/error automatically. */
  withSpan,

  /** Returns the active SpanContext ({ traceId, spanId }) or null if no span is active. */
  activeSpan(): SpanContext | null {
    return getActiveSpanContext();
  },

  /** Log suffix ready to append: " trace_id=xxx span_id=xxx" or "". */
  logSuffix(): string {
    return activeTraceLabel();
  },

  /**
   * Current size and drop pressure of the offline telemetry buffers.
   * A rising `dropped` count means the device has been offline long enough
   * to lose data. Surface it in health checks / dashboards.
   */
  bufferStats,

  /** Direct access to the OTel tracer for advanced use cases. */
  getTracer: _getTracer,

  /**
   * Method decorator — creates a span per invocation.
   * @example
   * class CheckoutUseCase {
   *   \@Tracing.Trace()
   *   async process(order: Order) { ... }
   * }
   */
  Trace,

  /**
   * Class decorator — creates a span per public method and propagates context.
   * Span name: `"<tracerName>.<methodName>"`.
   * @example
   * \@Tracing.TraceClass("checkout")
   * class CheckoutUseCase { ... }
   */
  TraceClass,
} as const;
