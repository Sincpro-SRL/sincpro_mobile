import type { Span } from "@opentelemetry/api";
import { ROOT_CONTEXT as OTEL_ROOT, SpanStatusCode, trace } from "@opentelemetry/api";

import { _getContextManager } from "../../context_manager/index.ts";
import type { InterceptorHooks, MethodCall } from "../../interceptor/intercept.ts";
import { OTEL_CTX_KEY } from "../context_keys.ts";

const _spanMap = new WeakMap<MethodCall, Span>();
// Tracks whether `before` successfully pushed a context entry for this call.
// Guards `after`/`onError` against popping a context they never pushed.
const _pushedMap = new WeakSet<MethodCall>();

/**
 * Returns InterceptorHooks that record an OTel span for every intercepted
 * method call. Parent-child relationships are maintained through the framework
 * StackContextManager: the OTel context (with the active span) is stored as a
 * value inside our Context, pushed in `before` and popped in `after`/`onError`.
 *
 * @param tracerName - instrumentation scope name, e.g. "sincpro.mobile.checkout"
 */
export function tracingHooks(tracerName: string): InterceptorHooks {
  return {
    before(call) {
      const manager = _getContextManager();
      const frameworkCtx = manager.active();

      // Read the OTel context carried inside our framework context.
      // Falls back to OTel ROOT if tracing has not been initialized yet.
      const otelCtx = frameworkCtx.get(OTEL_CTX_KEY) ?? OTEL_ROOT;

      const spanName = call.className
        ? `${call.className}.${call.methodName}`
        : call.methodName;

      const span = trace.getTracer(tracerName).startSpan(spanName, undefined, otelCtx);

      _spanMap.set(call, span);

      // Store the updated OTel context (now containing this span) back into
      // the framework context and push it onto the stack so nested calls see
      // this span as their parent.
      const newOtelCtx = trace.setSpan(otelCtx, span);
      manager.push(frameworkCtx.set(OTEL_CTX_KEY, newOtelCtx));
      _pushedMap.add(call);
    },

    after(call) {
      const span = _spanMap.get(call);
      if (!span) return;
      _spanMap.delete(call);

      span.setStatus({ code: SpanStatusCode.OK });
      span.end();

      if (_pushedMap.delete(call)) _getContextManager().pop();
    },

    onError(call, error) {
      const span = _spanMap.get(call);
      if (!span) return;
      _spanMap.delete(call);

      if (error instanceof Error) span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error)?.message });
      span.end();

      if (_pushedMap.delete(call)) _getContextManager().pop();
    },
  };
}
