import { logger } from "@sincpro/client-framework";
import { networkAdapter } from "@sincpro/mobile/adapters/Network.adapter";
import type { ConnectivityConfig } from "@sincpro/mobile/domain/connectivity";
import type { EventsConfig } from "@sincpro/mobile/domain/events";
import { listenToNetworkChanges } from "@sincpro/mobile/entrypoints/connectivity/network_changes";
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
   * What the app sets of its stored messages — events and Commands —, every key optional:
   * sent once (`retries: 0`), a failure goes to the failed ones; what goes over the network waits
   * for it; delivered ones kept 7 days, failed ones until a person retries or deletes them.
   * @example
   * events: {
   *   retries: 0,
   *   maxAttempts: Infinity,
   *   backoff: { first: 1_000, longest: 60_000 },
   *   keep: { delivered: 7, failed: "forever" },
   *   byName: { "chat.CommandSendMessage": { requiresNetwork: true, retries: 2 } },
   * }
   */
  events?: EventsConfig;
  /**
   * How the app knows there is internet: the phone's reading, at once on every change and on the
   * cron; `check` adds the app's own proof — its server answers.
   */
  connectivity?: ConnectivityConfig;
  /**
   * Override options for any cron by taskName.
   * `ui` marks the cron for the activity toast. Silence is the default.
   * @example
   * crons: { CHECK_NETWORK: { ui: true, label: "Verificando conexión" } }
   */
  crons?: Record<string, Partial<CronWorkerOpts>>;
}

/**
 * Builds the kernel without IO: safe to call while the bundle loads. It installs Web Crypto's
 * random source (`installWebCrypto`), which every run's id needs, and instruments the process
 * every bounded context runs with (`instrumentObservability`), so a background task the OS
 * wakes runs traced, logged and reported the same way.
 */
export function createKernel(
  config: Pick<
    AppConfig,
    "domains" | "crons" | "observability" | "events" | "connectivity"
  > = {},
): Kernel {
  // Every run needs an id before anything else, and Hermes has no Web Crypto.
  installWebCrypto();
  instrumentObservability(config.observability);
  eventDelivery.configure(config.events);
  networkAdapter.configure(config.connectivity);
  const kernel = new Kernel([baseModule, ...(config.domains ?? [])]);
  if (config.crons) kernel.applyCronConfig(config.crons);
  kernel.registerExtensions();
  return kernel;
}

/**
 * Starts a kernel built with {@link createKernel}: data layer, queue, crons, the phone's network
 * changes and the shipping of what the process was instrumented with.
 */
export async function startApp(
  kernel: Kernel,
  config: Pick<AppConfig, "events"> = {},
): Promise<Kernel> {
  // The migrations first — the telemetry's tables are among them —, then shipping, and only then
  // the queue, the crons and the hooks: every run, the first ones included, is traced and logged.
  await kernel.bootstrap();
  const telemetry = processObservability()?.telemetry;
  if (telemetry) await initTelemetry(telemetry);
  orchestrator.configure(kernel);
  await orchestrator.bootstrap();
  listenToNetworkChanges();
  // Off the startup path: pruning is housekeeping, never a reason to wait.
  commonBoundedContext
    .execute(new CommandPruneEventHistory(config.events?.keep))
    .catch((error: unknown) =>
      logger.warn("Event history pruning failed", errorAttributes(error)),
    );

  return kernel;
}

export function createApp(config: AppConfig = {}): Promise<Kernel> {
  return startApp(createKernel(config), config);
}
