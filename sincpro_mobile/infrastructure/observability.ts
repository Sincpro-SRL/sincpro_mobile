import { configureProcess } from "@sincpro/client-framework";
import { openTelemetryTracer } from "@sincpro/client-framework/opentelemetry";

import { mobileLogger } from "./logger";
import { getTracer } from "./telemetry/tracing/tracer";

/** The instrumentation scope every span of a use case is opened under. */
export const TRACER_SCOPE = "@sincpro/mobile";

/**
 * The process every bounded context of the app runs with: its spans through OpenTelemetry —
 * the provider `initTelemetry` registers, buffered in SQLite and shipped over OTLP — and its
 * lines through the console and Loki (`mobileLogger`).
 *
 * Context: called once, while the bundle loads (`createKernel`), before any use case runs; a
 * closed app the OS wakes builds the same kernel, so a background task runs with it too. The
 * tracer is OpenTelemetry's global one: it answers through whatever provider is registered when
 * a span starts, and records nothing while telemetry is off.
 */
export function configureObservability(): void {
  configureProcess({
    tracer: openTelemetryTracer(getTracer(TRACER_SCOPE)),
    logger: { engine: mobileLogger },
  });
}
