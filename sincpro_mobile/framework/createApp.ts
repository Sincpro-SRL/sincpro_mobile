import { logger } from "@sincpro/client-framework";
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
   * Override options for any cron by taskName.
   * `ui` marks the cron for the activity toast. Silence is the default.
   * @example
   * crons: { CHECK_NETWORK: { ui: true, label: "Verificando conexión" } }
   */
  crons?: Record<string, Partial<CronWorkerOpts>>;
  /** Days an acknowledged event stays in the local log. Defaults to 7. */
  eventRetentionDays?: number;
}

/**
 * Builds the kernel without IO: safe to call while the bundle loads. It installs Web Crypto's
 * random source (`installWebCrypto`), which every run's id needs, and instruments the process
 * every bounded context runs with (`instrumentObservability`), so a background task the OS
 * wakes runs traced, logged and reported the same way.
 */
export function createKernel(
  config: Pick<AppConfig, "domains" | "crons" | "observability"> = {},
): Kernel {
  // Every run needs an id before anything else, and Hermes has no Web Crypto.
  installWebCrypto();
  instrumentObservability(config.observability);
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
  config: Pick<AppConfig, "eventRetentionDays"> = {},
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
    .execute(new CommandPruneEventHistory(config.eventRetentionDays))
    .catch((error: unknown) =>
      logger.warn("Event history pruning failed", errorAttributes(error)),
    );

  return kernel;
}

export function createApp(config: AppConfig = {}): Promise<Kernel> {
  return startApp(createKernel(config), config);
}
