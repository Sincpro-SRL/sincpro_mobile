import { type Chain } from "@sincpro/mobile/domain/events/chain";
import { generateUUID } from "@sincpro/mobile/infrastructure/database/utils";
import { getActiveSpanContext } from "@sincpro/mobile/infrastructure/telemetry/tracing/active_span";

import { createContextKey } from "./context_manager/context_key";
import { getActiveContext, getContext, runWithContext } from "./context_manager/index";

export const EVENT_CHAIN_KEY = createContextKey<Chain>("sincpro.event.chain");

export function openChain(active: Chain | undefined): Chain {
  const executionId = generateUUID();
  if (!active) {
    return { causationId: executionId, correlationId: executionId };
  }
  return { causationId: executionId, correlationId: active.correlationId };
}

export function currentChain(): Chain | undefined {
  return getContext(EVENT_CHAIN_KEY);
}

export function runWithChain<T>(chain: Chain, fn: () => T): T {
  return runWithContext(getActiveContext().set(EVENT_CHAIN_KEY, chain), fn);
}

export function traceparent(): string | null {
  const span = getActiveSpanContext();
  if (!span) return null;
  const flags = span.traceFlags.toString(16).padStart(2, "0");
  return `00-${span.traceId}-${span.spanId}-${flags}`;
}
