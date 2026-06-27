import type { Context as OtelContext } from "@opentelemetry/api";

import { createContextKey } from "../context_manager/index";

/**
 * Key under which the active OTel Context (carrying the current Span) is
 * stored inside the framework Context. Shared between tracing_hooks (writes)
 * and active_span (reads) so both sides reference the same Symbol.
 */
export const OTEL_CTX_KEY = createContextKey<OtelContext>("sincpro.telemetry.otel_context");
