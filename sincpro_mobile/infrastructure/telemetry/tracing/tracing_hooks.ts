import type { Span } from "@opentelemetry/api";
import { ROOT_CONTEXT as OTEL_ROOT, SpanStatusCode, trace } from "@opentelemetry/api";
import { _getContextManager } from "@sincpro/mobile/infrastructure/context_manager";
import { EVENT_CHAIN_KEY, openChain } from "@sincpro/mobile/infrastructure/event_chain";
import type {
  InterceptorHooks,
  MethodCall,
} from "@sincpro/mobile/infrastructure/interceptor/intercept";
import { OTEL_CTX_KEY } from "@sincpro/mobile/infrastructure/telemetry/context_keys";

const _spanMap = new WeakMap<MethodCall, Span>();
// Tracks whether `before` successfully pushed a context entry for this call.
// Guards `after`/`onError` against popping a context they never pushed.
const _pushedMap = new WeakSet<MethodCall>();

/**
 * A span per intercepted call. The active span lives in the framework context,
 * so a nested call — an application service running a feature — is a child of
 * the same trace.
 *
 * Tracing is optional. No provider, a missing SDK, or an exporter that throws:
 * the hooks swallow it and the use case runs. `before` only records a push it
 * actually made, so `after` never pops a context it did not push.
 *
 * @param tracerName - instrumentation scope, e.g. "sincpro.mobile.checkout"
 */
export function tracingHooks(tracerName: string): InterceptorHooks {
  return {
    before(call) {
      const manager = _getContextManager();
      let ctx = manager.active();
      ctx = ctx.set(EVENT_CHAIN_KEY, openChain(ctx.get(EVENT_CHAIN_KEY)));
      try {
        const otelCtx = ctx.get(OTEL_CTX_KEY) ?? OTEL_ROOT;
        const spanName = call.className
          ? `${call.className}.${call.methodName}`
          : call.methodName;
        const span = trace.getTracer(tracerName).startSpan(spanName, undefined, otelCtx);
        _spanMap.set(call, span);
        ctx = ctx.set(OTEL_CTX_KEY, trace.setSpan(otelCtx, span));
      } catch {
        _spanMap.delete(call);
      }
      manager.push(ctx);
      _pushedMap.add(call);
    },

    after(call) {
      const span = _spanMap.get(call);
      _spanMap.delete(call);
      try {
        span?.setStatus({ code: SpanStatusCode.OK });
        span?.end();
      } catch {
        // The use case already finished. A failing exporter does not change that.
      } finally {
        pop(call);
      }
    },

    onError(call, error) {
      const span = _spanMap.get(call);
      _spanMap.delete(call);
      try {
        if (error instanceof Error) span?.recordException(error);
        span?.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : undefined,
        });
        span?.end();
      } catch {
        // Same as `after`: the business error is the one that propagates.
      } finally {
        pop(call);
      }
    },
  };
}

function pop(call: MethodCall): void {
  if (!_pushedMap.delete(call)) return;
  try {
    _getContextManager().pop();
  } catch {
    // The stack was already cleared. Nothing of this call is left on it.
  }
}
