import {
  configureProcess,
  type ErrorReporter,
  type IdentityKeys,
  type ProcessIdentity,
  processIdentity,
} from "@sincpro/client-framework";
import { openTelemetryTracer } from "@sincpro/client-framework/opentelemetry";
import { type ExceptionClient, sentryReporter } from "@sincpro/client-framework/sentry";
import * as Application from "expo-application";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { configureLogger, mobileLogger, setConsoleDebug } from "./logger";
import { getTracer } from "./telemetry/tracing/tracer";
import type { FlushConfig, TelemetryConfig } from "./telemetry/types";

/** The instrumentation scope every span of a use case is opened under. */
export const TRACER_SCOPE = "@sincpro/mobile";

/**
 * Who is running — read from the app itself, the same on its traces, its log lines and its
 * reports, with sincpro_framework's keys.
 */
export type AppIdentity = {
  /** The app's slug (`sincpro-mobile-tickets`): `service.name`, and Loki's `app`/`service_name`. */
  readonly name: string;
  /** Its store id (`bo.com.sincpro.tickets`). */
  readonly id: string;
  /** app.json's `version` the bundle carries — an update (OTA) brings its own. */
  readonly version: string;
  /** The native build EAS numbers on every build (versionCode, CFBundleVersion). */
  readonly build: string;
  /** `production`, `preview` or `development`. */
  readonly environment: string;
  /** `<name>:<version>` — sincpro_framework's release: GlitchTip's release, the traces' `release`. */
  readonly release: string;
};

/** Where the app's observability goes — one option of `defineAppShell`, everything in it. */
export type ObservabilityConfig = {
  /** `production`, `preview`, `development`. Default: development in a debug build. */
  environment?: string;
  /**
   * The tenant the deployment serves, when it serves one — almost never on a phone, where the
   * app is open to whoever installs it. A run's own tenant comes from its context (`tenant`).
   */
  tenant?: string;
  /**
   * The keys of a run's context that say its tenant and its user — optional both. By default
   * `tenant`/`tenant_id` and `user_id`; an app whose tenant is its company says
   * `{ tenant: "company_id" }`. Nothing is sent when the context says none.
   */
  keys?: IdentityKeys;
  /** Traces, to an OTLP collector (`https://otlp.sincpro.dev`; `/v1/traces` is added). */
  traces?: { endpoint: string; headers?: Record<string, string> };
  /**
   * Log lines: their level and, with an endpoint, Loki (`https://loki.sincpro.dev`;
   * `/loki/api/v1/push` is added). `info` by default; `debug` sends everything, `warn` only
   * problems. In a debug build the console prints from that level; a release build's console
   * stays silent.
   */
  logs?: {
    endpoint?: string;
    headers?: Record<string, string>;
    level?: "debug" | "info" | "warn";
  };
  /**
   * Unexpected failures: the app's Sentry-compatible client (GlitchTip), initialized by the app
   * with who is running — its release, its build as `dist`, its environment. Expected ones (a
   * printer off, a refusal) are never reported.
   */
  errors?: (app: AppIdentity) => ExceptionClient | undefined;
  /** Delivery tuning of traces and logs. */
  flush?: FlushConfig;
};

/** What the process was instrumented with. */
export type Observability = {
  readonly app: AppIdentity;
  /** Started after the migrations (`startApp`), and by a background flush. */
  readonly telemetry: TelemetryConfig | undefined;
  readonly reporter: ErrorReporter | undefined;
};

let current: Observability | undefined;

/** A debug build (`__DEV__`); false where the global does not exist (Node). */
function debugBuild(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

/**
 * Instruments the process — what `createKernel` does while the bundle loads, before any use
 * case runs, so a background task the OS wakes runs the same way:
 * 1. Who is running, read from the app (`appIdentity`).
 * 2. Its log lines: the console's mode and level, and what Loki receives.
 * 3. Its unexpected failures: the app's client, wrapped as the process's reporter.
 * 4. The process (client-framework's `configureProcess`): who is running — its release and its
 *    tenant, on every span, line and report —, spans through OpenTelemetry's global tracer — the
 *    provider `initTelemetry` registers, buffered in SQLite and shipped over OTLP —, lines
 *    through `mobileLogger`.
 * Final: the telemetry config, started after the migrations so its tables exist.
 */
export function instrumentObservability(config: ObservabilityConfig = {}): Observability {
  const app = appIdentity(config.environment);
  configureLogs(config.logs);
  const client = config.errors?.(app);
  const reporter = client ? sentryReporter(client) : undefined;
  configureProcess({
    identity: {
      release: app.release,
      ...(config.tenant ? { tenant: config.tenant } : {}),
      ...(config.keys ? { keys: config.keys } : {}),
    },
    tracer: openTelemetryTracer(getTracer(TRACER_SCOPE)),
    logger: { engine: mobileLogger },
    ...(reporter ? { reporter } : {}),
  });
  current = { app, telemetry: telemetryOf(app, processIdentity(), config), reporter };
  return current;
}

/** What the process was instrumented with; before `createKernel`, nothing. */
export function processObservability(): Observability | undefined {
  return current;
}

/**
 * Who is running, from its config (`expo-constants`) and its native binary (`expo-application`),
 * never from a value written by hand. The version is the bundle's, so an update shows its own.
 */
export function appIdentity(environment?: string): AppIdentity {
  const name = Constants?.expoConfig?.slug ?? "app";
  const id = Application?.applicationId ?? name;
  const version =
    Constants?.expoConfig?.version ?? Application?.nativeApplicationVersion ?? "0.0.0";
  const build = Application?.nativeBuildVersion ?? "0";
  return {
    name,
    id,
    version,
    build,
    environment: environment || (debugBuild() ? "development" : "production"),
    release: `${name}:${version}`,
  };
}

/** The console's mode from the build, and the level both the console and Loki take. */
function configureLogs(logs: ObservabilityConfig["logs"]): void {
  const level = logs?.level ?? "info";
  configureLogger({
    mode: debugBuild() ? "development" : "production",
    level: level === "debug" ? "debug" : "info",
    loki: level,
  });
  if (debugBuild()) setConsoleDebug(level !== "warn");
}

/**
 * Traces and log lines, each saying who sent it with client-framework's identity — the same
 * `release`, `service.name`, `service.version` and `tenant` its spans, lines and reports carry —
 * and what only the phone knows: its build, its store id, its OS. Nothing without an endpoint.
 */
function telemetryOf(
  app: AppIdentity,
  identity: ProcessIdentity | undefined,
  config: ObservabilityConfig,
): TelemetryConfig | undefined {
  const { traces, logs } = config;
  if (!traces && !logs?.endpoint) return undefined;
  const serviceName = identity?.serviceName ?? app.name;
  const serviceVersion = identity?.serviceVersion ?? app.version;
  const tenant = identity?.tenant;
  return {
    serviceName,
    serviceVersion,
    deploymentEnvironment: app.environment,
    resourceAttributes: {
      release: identity?.release ?? app.release,
      ...(tenant ? { tenant } : {}),
      "app.id": app.id,
      "app.build": app.build,
      "os.type": Platform?.OS ?? "unknown",
      "os.version": String(Platform?.Version ?? ""),
    },
    ...(traces ? { otlp: { endpoint: traces.endpoint, headers: traces.headers } } : {}),
    ...(logs?.endpoint
      ? {
          loki: {
            endpoint: logs.endpoint,
            labels: {
              app: serviceName,
              service_name: serviceName,
              env: app.environment,
              version: serviceVersion,
              ...(tenant ? { tenant } : {}),
            },
            headers: logs.headers,
          },
        }
      : {}),
    ...(config.flush ? { flush: config.flush } : {}),
  };
}
