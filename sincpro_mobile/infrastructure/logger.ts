import {
  type Attributes,
  combineLoggers,
  type Logger,
  type LogLayer,
  type LogLevel,
  type LogRecord,
} from "@sincpro/client-framework";
import { consoleLogger } from "@sincpro/client-framework/console";

import { getLokiClient } from "./telemetry/logging/loki_registry";
import { activeTraceLabel } from "./telemetry/tracing/active_span";

/**
 * Where the lines of the client framework go on a phone: the console and Loki.
 *
 * Context: there is one logger per layer — `logger` (infrastructure) and `loggerAdapter`
 * (adapters) from `@sincpro/client-framework`, and `this.logger` inside a use case —, never one
 * per screen or service. This module only owns the policy of the two destinations:
 *
 * - The console is the framework's engine (`consoleLogger`): silent in production, WARN and
 *   ERROR always printed in development, INFO and DEBUG only while the in-app debug switch is on
 *   and the line's layer is enabled.
 * - Loki receives ERROR and WARN always and, from enabled layers, what its level asks for —
 *   INFO by default, DEBUG when the host asks (`configureLogger({ loki: "debug" })`) —, whatever
 *   the console shows: production incidents must be observable.
 *
 * The engine reads the policy on every line, so a debug switch never reconfigures the process.
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

/** The packaged quiet defaults: adapters (Odoo's HTTP, repositories) stay off until asked. */
export const DEFAULT_ENABLED_LAYERS: Readonly<Record<LogLayer, boolean>> = {
  infrastructure: true,
  adapter: false,
  bounded_context: true,
  event_handler: true,
  application_service: true,
  feature: true,
};

/** What a host decides about the console: production or development, and how verbose. */
export type LoggerPolicy = {
  mode?: "development" | "production";
  /** Development INFO/DEBUG threshold while the debug switch is on. */
  level?: Extract<LogLevel, "debug" | "info">;
  /** Layers whose INFO/DEBUG may speak; WARN/ERROR are never hidden. */
  layers?: Partial<Record<LogLayer, boolean>>;
  /**
   * The lowest level Loki receives: `info` (the default), `debug` to ship everything, `warn` to
   * ship only problems. WARN and ERROR always go; INFO and DEBUG only from enabled layers.
   */
  loki?: Extract<LogLevel, "debug" | "info" | "warn">;
};

const RANK: Readonly<Record<LogLevel, number>> = { debug: 0, info: 1, warn: 2, error: 3 };

const MAX_LINE = 2048;

let mode: "development" | "production" = "development";
let level: "debug" | "info" = "info";
let lokiLevel: "debug" | "info" | "warn" = "info";
let consoleDebug = false;
const enabledLayers: Record<LogLayer, boolean> = { ...DEFAULT_ENABLED_LAYERS };

type LoggerListener = () => void;
const listeners = new Set<LoggerListener>();

let consoleEngine: Logger = consoleLogger(consoleOptions());

function consoleOptions() {
  return {
    mode,
    level: consoleDebug ? level : ("warn" as const),
    layers: { ...enabledLayers },
  };
}

function changed(): void {
  consoleEngine = consoleLogger(consoleOptions());
  for (const listener of listeners) listener();
}

function attributesText(attributes: Attributes | undefined): string {
  if (!attributes) return "";
  return Object.entries(attributes)
    .map(([name, value]) => ` ${name}=${String(value)}`)
    .join("");
}

/**
 * A record as one Loki line: `[layer] [use case] message key=value trace_id=… span_id=…`.
 * The run's trace when the record carries one, else the span active in the context manager.
 */
export function lokiLine(record: LogRecord): string {
  const where = record.useCase ? ` [${record.useCase}]` : "";
  const trace = record.traceId
    ? ` trace_id=${record.traceId} span_id=${record.spanId ?? ""}`
    : activeTraceLabel();
  const line = `[${record.layer}]${where} ${record.message}${attributesText(record.attributes)}`;
  const kept = line.length > MAX_LINE ? `${line.slice(0, MAX_LINE)}…` : line;
  return kept + trace;
}

/** Loki's policy: ERROR and WARN always; INFO and DEBUG from enabled layers, at its level. */
function shipsToLoki(record: LogRecord): boolean {
  if (record.level === "error" || record.level === "warn") return true;
  return RANK[record.level] >= RANK[lokiLevel] && enabledLayers[record.layer];
}

const lokiEngine: Logger = {
  log(record) {
    if (!shipsToLoki(record)) return;
    const client = getLokiClient();
    if (!client) return;
    const line = lokiLine(record);
    queueMicrotask(() => client.push(record.level, line));
  },
};

/** The engine every bounded context of the app logs through: the console and Loki. */
export const mobileLogger: Logger = combineLoggers(
  { log: (record) => consoleEngine.log(record) },
  lokiEngine,
);

/**
 * The host's console policy (`mode` from `__DEV__`, the level, the layers). Applies at once,
 * to every line from then on.
 */
export function configureLogger(policy: LoggerPolicy): void {
  if (policy.mode !== undefined) mode = policy.mode;
  if (policy.level !== undefined) level = policy.level;
  if (policy.loki !== undefined) lokiLevel = policy.loki;
  if (policy.layers) patchLayers(policy.layers);
  changed();
}

/** The in-app debug switch: INFO/DEBUG on the console. WARN/ERROR always print. */
export function setConsoleDebug(enabled: boolean): void {
  if (consoleDebug === enabled) return;
  consoleDebug = enabled;
  changed();
}

export function isConsoleDebug(): boolean {
  return consoleDebug;
}

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

export function resetEnabledLayers(): void {
  setEnabledLayers(DEFAULT_ENABLED_LAYERS);
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
