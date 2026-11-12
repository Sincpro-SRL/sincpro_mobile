import {
  type Attributes,
  combineLoggers,
  filteredLogger,
  type LogFilter,
  type Logger,
  type LogLayer,
  type LogRecord,
} from "@sincpro/client-framework";
import { consoleLogger } from "@sincpro/client-framework/console";

import { shipLog } from "./telemetry/logging/loki_registry";
import { activeTraceLabel } from "./telemetry/tracing/active_span";

/**
 * Where the lines of the client framework go on a phone — the console and Loki — and which of
 * them speak.
 *
 * Context: there is one logger per layer — `logger` (infrastructure) and `loggerAdapter`
 * (adapters) from `@sincpro/client-framework`, and `this.logger` inside a use case —, never one
 * per screen or service. This module owns the policy of the two destinations, one rule for both
 * (client-framework's `LogFilter`):
 *
 * - **Production**: what the app ships normally — its own bounded contexts at `info`; the core's
 *   `common`, the `adapter` and `infrastructure` layers quiet.
 * - **Debugging** — a debug build, or the person's switch (`Debug`): everything speaks, but the
 *   layers the person turns off on the debug screen.
 * - WARN and ERROR always speak, in both. Spans are never filtered: a quiet line still has its
 *   span in Tempo.
 *
 * The console prints only in a debug build; Loki receives what speaks, stored first and sent in
 * batches (`shipLog`). The filter is read on every line, so the switch never reconfigures the
 * process.
 */

/** Every layer a line can come from, in the order the debug screen lists them. */
export const LOG_LAYERS: readonly LogLayer[] = [
  "infrastructure",
  "adapter",
  "bounded_context",
  "event_handler",
  "application_service",
  "feature",
];

/** What speaks in production when the app says nothing. */
export const DEFAULT_PRODUCTION_LOGS: LogFilter = {
  level: "info",
  layers: { adapter: false, infrastructure: false },
  boundedContexts: { common: false },
};

/** What speaks while debugging when the app says nothing: every line. */
export const DEFAULT_DEBUG_LOGS: LogFilter = { level: "debug" };

/** What a host decides about its lines. */
export type LoggerPolicy = {
  /** `development` prints on the console (a debug build); `production` keeps it silent. */
  mode?: "development" | "production";
  /** What speaks normally, over `DEFAULT_PRODUCTION_LOGS`. */
  production?: LogFilter;
  /** What speaks while debugging, over `DEFAULT_DEBUG_LOGS`; the person's layers go over it. */
  debug?: LogFilter;
};

const MAX_LINE = 2048;

let mode: "development" | "production" = "development";
let production: LogFilter = DEFAULT_PRODUCTION_LOGS;
let debugging: LogFilter = DEFAULT_DEBUG_LOGS;
let debugLogging = false;
const enabledLayers: Record<LogLayer, boolean> = debugLayersOf(debugging);

type LoggerListener = () => void;
const listeners = new Set<LoggerListener>();

let consoleEngine: Logger = consoleLogger({ mode });

/** `filter` over `base`, rule by rule. */
function over(base: LogFilter, filter: LogFilter | undefined): LogFilter {
  return {
    level: filter?.level ?? base.level,
    layers: { ...base.layers, ...filter?.layers },
    boundedContexts: { ...base.boundedContexts, ...filter?.boundedContexts },
  };
}

/** The layers that speak while debugging, as the debug screen shows them: all but those turned off. */
function debugLayersOf(filter: LogFilter): Record<LogLayer, boolean> {
  return Object.fromEntries(
    LOG_LAYERS.map((layer) => [layer, filter.layers?.[layer] !== false]),
  ) as Record<LogLayer, boolean>;
}

/** What speaks now: debugging — with the person's layers —, or production. */
function speaking(): LogFilter {
  return debugLogging ? { ...debugging, layers: { ...enabledLayers } } : production;
}

function changed(): void {
  consoleEngine = consoleLogger({ mode });
  for (const listener of listeners) listener();
}

function attributesText(attributes: Attributes | undefined): string {
  if (!attributes) return "";
  return Object.entries(attributes)
    .map(([name, value]) => ` ${name}=${String(value)}`)
    .join("");
}

/** An unexpected failure's stack, after its line, cut here: enough frames to find it. */
const MAX_STACK = 4096;

/**
 * A record as one Loki line, with sincpro_framework's keys:
 * `[layer] [use case] message key=value release=… tenant=… user_id=… error_type=… error_at=…
 * trace_id=… span_id=…` — and, below it, an unexpected failure's stack.
 * The run's trace when the record carries one, else the span active in the context manager.
 */
export function lokiLine(record: LogRecord): string {
  const where = record.useCase ? ` [${record.useCase}]` : "";
  const trace = record.traceId
    ? ` trace_id=${record.traceId} span_id=${record.spanId ?? ""}`
    : activeTraceLabel();
  const failure = record.failure;
  const keys = attributesText({
    ...(record.release ? { release: record.release } : {}),
    ...(record.tenant ? { tenant: record.tenant } : {}),
    ...(record.userId ? { user_id: record.userId } : {}),
    ...(failure
      ? {
          error_type: failure.type,
          sincpro_outcome: failure.kind,
          ...(failure.at ? { error_at: failure.at } : {}),
          ...(failure.failedIn ? { failed_in: failure.failedIn } : {}),
        }
      : {}),
  });
  const line = `[${record.layer}]${where} ${record.message}${attributesText(record.attributes)}${keys}`;
  const kept = line.length > MAX_LINE ? `${line.slice(0, MAX_LINE)}…` : line;
  const stack = failure?.stack
    ? `\n${failure.stack.length > MAX_STACK ? `${failure.stack.slice(0, MAX_STACK)}…` : failure.stack}`
    : "";
  return kept + trace + stack;
}

const lokiEngine: Logger = {
  log(record) {
    shipLog(record.level, lokiLine(record));
  },
};

/**
 * The engine every bounded context of the app logs through: what speaks (`speaking`) goes to the
 * console (a debug build) and to Loki.
 */
export const mobileLogger: Logger = filteredLogger(
  combineLoggers({ log: (record) => consoleEngine.log(record) }, lokiEngine),
  speaking,
);

/**
 * The host's policy: the console's mode, what speaks normally and what speaks while debugging.
 * Applies at once, to every line from then on; the person's layers start from the debug filter.
 */
export function configureLogger(policy: LoggerPolicy): void {
  if (policy.mode !== undefined) mode = policy.mode;
  if (policy.production !== undefined)
    production = over(DEFAULT_PRODUCTION_LOGS, policy.production);
  if (policy.debug !== undefined) {
    debugging = over(DEFAULT_DEBUG_LOGS, policy.debug);
    patchLayers(debugLayersOf(debugging));
  }
  changed();
}

/** What speaks normally — the production filter in use. */
export function productionLogs(): LogFilter {
  return production;
}

/** The debug switch: everything speaks (but the layers turned off). WARN/ERROR always speak. */
export function setDebugLogging(enabled: boolean): void {
  if (debugLogging === enabled) return;
  debugLogging = enabled;
  changed();
}

export function isDebugLogging(): boolean {
  return debugLogging;
}

/** The layers that speak while debugging. */
export function getEnabledLayers(): Record<LogLayer, boolean> {
  return { ...enabledLayers };
}

export function isLayerEnabled(layer: LogLayer): boolean {
  return enabledLayers[layer];
}

export function setLayerEnabled(layer: LogLayer, enabled: boolean): void {
  if (enabledLayers[layer] === enabled) return;
  enabledLayers[layer] = enabled;
  changed();
}

/** Whether the patch moved any layer. */
function patchLayers(patch: Partial<Record<LogLayer, boolean>>): boolean {
  let moved = false;
  for (const layer of LOG_LAYERS) {
    const next = patch[layer];
    if (next === undefined || enabledLayers[layer] === next) continue;
    enabledLayers[layer] = next;
    moved = true;
  }
  return moved;
}

export function setEnabledLayers(patch: Partial<Record<LogLayer, boolean>>): void {
  if (patchLayers(patch)) changed();
}

/** Back to the debug filter's layers — the app's, every layer when it says nothing. */
export function resetEnabledLayers(): void {
  setEnabledLayers(debugLayersOf(debugging));
}

/** The debug filter's layers, as `resetEnabledLayers` leaves them. */
export function defaultEnabledLayers(): Record<LogLayer, boolean> {
  return debugLayersOf(debugging);
}

/** Hears the debug switch and every layer change. Answers how to stop. */
export function subscribeLoggerConfig(listener: LoggerListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A failure as a log attribute: its name and message, never its stack or its body. */
export function errorAttributes(error: unknown): Attributes {
  if (error instanceof Error) return { error: `${error.name}: ${error.message}` };
  return { error: String(error) };
}
