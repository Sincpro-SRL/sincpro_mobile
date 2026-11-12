import { logger } from "@sincpro/client-framework";
import { eventDelivery } from "@sincpro/mobile/infrastructure/events/delivery";
import { errorAttributes } from "@sincpro/mobile/infrastructure/logger";
import {
  instrumentObservability,
  type ObservabilityConfig,
  processObservability,
} from "@sincpro/mobile/infrastructure/observability";
import { initTelemetry } from "@sincpro/mobile/infrastructure/telemetry";
import { installWebCrypto } from "@sincpro/mobile/infrastructure/web_crypto";
import type { CronWorkerOpts } from "@sincpro/mobile/infrastructure/workers";
import { commonBoundedContext } from "@sincpro/mobile/services";
import { CommandPruneEventHistory } from "@sincpro/mobile/services/events/prune_event_history.feature";

import { baseModule } from "./base_module";
import type { DomainModule } from "./domain_module";
import { Kernel } from "./kernel";
import { orchestrator } from "./orchestrator";

export interface AppConfig {
  domains?: DomainModule[];
  /**
   * Everything observability, in one place: traces (OTLP), log lines and their level (Loki),
   * unexpected failures (GlitchTip), each saying who is running. Instrumented while the kernel
   * is built; traces and logs start shipping after the migrations, so their tables exist.
   */
  observability?: ObservabilityConfig;
  /**
   * What the app changes of its stored events. All optional: unsaid keeps the defaults.
   * @example
   * events: {
   *   // A failed print goes to the failed prints at once, for the person to retry.
   *   attempts: { [PrintImageRequestedEvent.eventName]: 1 },
   *   // Failed events are dropped 30 days after they failed.
   *   retentionDays: { failed: 30 },
   * }
   */
  events?: EventsConfig;
  /**
   * Override options for any cron by taskName.
   * `ui` marks the cron for the activity toast. Silence is the default.
   * @example
   * crons: { CHECK_NETWORK: { ui: true, label: "Verificando conexión" } }
   */
  crons?: Record<string, Partial<CronWorkerOpts>>;
  /** @deprecated `events.retentionDays.delivered` — it wins when both are set. */
  eventRetentionDays?: number;
}

/**
 * What an app changes of its stored events — nothing is forced; emptying them when needed is
 * `CommandClearEvents`, which nothing runs on its own.
 */
export interface EventsConfig {
  /**
   * By event name, the attempts its delivery gets before it is set aside — the failed ones —:
   * the event's own (`static attempts`), else 10, when unsaid. `1` never retries it on its own.
   */
  readonly attempts?: Readonly<Record<string, number>>;
  /** How long a stored event is kept, in days, by how it ended. */
  readonly retentionDays?: {
    /** Delivered: 7 when unsaid; `Infinity` keeps them. */
    readonly delivered?: number;
    /** Failed: until the person retries or deletes them when unsaid; else dropped after. */
    readonly failed?: number;
  };
}

/**
 * Builds the kernel without IO: safe to call while the bundle loads. It installs Web Crypto's
 * random source (`installWebCrypto`), which every run's id needs, and instruments the process
 * every bounded context runs with (`instrumentObservability`), so a background task the OS
 * wakes runs traced, logged and reported the same way.
 */
export function createKernel(
  config: Pick<AppConfig, "domains" | "crons" | "observability" | "events"> = {},
): Kernel {
  // Every run needs an id before anything else, and Hermes has no Web Crypto.
  installWebCrypto();
  instrumentObservability(config.observability);
  eventDelivery.configure({ attempts: config.events?.attempts });
  const kernel = new Kernel([baseModule, ...(config.domains ?? [])]);
  if (config.crons) kernel.applyCronConfig(config.crons);
  kernel.registerExtensions();
  return kernel;
}

/**
 * Starts a kernel built with {@link createKernel}: data layer, queue, crons and the shipping of
 * what the process was instrumented with.
 */
export async function startApp(
  kernel: Kernel,
  config: Pick<AppConfig, "eventRetentionDays" | "events"> = {},
): Promise<Kernel> {
  // The migrations first — the telemetry's tables are among them —, then shipping, and only then
  // the queue, the crons and the hooks: every run, the first ones included, is traced and logged.
  await kernel.bootstrap();
  const telemetry = processObservability()?.telemetry;
  if (telemetry) await initTelemetry(telemetry);
  orchestrator.configure(kernel);
  await orchestrator.bootstrap();
  // Off the startup path: pruning is housekeeping, never a reason to wait.
  commonBoundedContext
    .execute(
      new CommandPruneEventHistory(
        config.events?.retentionDays?.delivered ?? config.eventRetentionDays,
        config.events?.retentionDays?.failed,
      ),
    )
    .catch((error: unknown) =>
      logger.warn("Event history pruning failed", errorAttributes(error)),
    );

  return kernel;
}

export function createApp(config: AppConfig = {}): Promise<Kernel> {
  return startApp(createKernel(config), config);
}
