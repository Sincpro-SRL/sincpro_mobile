import { type ErrorReporter, logger } from "@sincpro/client-framework";
import { errorAttributes } from "@sincpro/mobile/infrastructure/logger";
import { configureObservability } from "@sincpro/mobile/infrastructure/observability";
import type { TelemetryConfig } from "@sincpro/mobile/infrastructure/telemetry";
import { initTelemetry } from "@sincpro/mobile/infrastructure/telemetry";
import type { CronWorkerOpts } from "@sincpro/mobile/infrastructure/workers";
import { commonBoundedContext } from "@sincpro/mobile/services";
import { CommandPruneEventHistory } from "@sincpro/mobile/services/events/stored_events.feature";

import { baseModule } from "./base_module";
import type { DomainModule } from "./domain_module";
import { Kernel } from "./kernel";
import { orchestrator } from "./orchestrator";

export interface AppConfig {
  domains?: DomainModule[];
  /**
   * Opt-in telemetry. When provided, the Loki client and flush cron start automatically
   * after migrations complete — so the `telemetry_queue` table is guaranteed to exist.
   */
  telemetry?: TelemetryConfig;
  /**
   * Override options for any cron by taskName.
   * `ui` marks the cron for the activity toast. Silence is the default.
   * @example
   * crons: { CHECK_NETWORK: { ui: true, label: "Verificando conexión" } }
   */
  crons?: Record<string, Partial<CronWorkerOpts>>;
  /** Days an acknowledged event stays in the local log. Defaults to 7. */
  eventRetentionDays?: number;
  /**
   * Where an unexpected failure of a use case is reported: `sentryReporter(Sentry)` over the
   * client the app initialized (GlitchTip speaks Sentry). Expected ones — a printer off, a
   * refusal — are never reported. Omit it and nothing is.
   */
  reporter?: ErrorReporter;
}

/**
 * Builds the kernel without IO: safe to call while the bundle loads. It also configures the
 * process every bounded context runs with (`configureObservability`), so a background task the
 * OS wakes runs traced and logged the same way.
 */
export function createKernel(
  config: Pick<AppConfig, "domains" | "crons" | "reporter"> = {},
): Kernel {
  configureObservability({ reporter: config.reporter });
  const kernel = new Kernel([baseModule, ...(config.domains ?? [])]);
  if (config.crons) kernel.applyCronConfig(config.crons);
  kernel.registerExtensions();
  return kernel;
}

/** Starts a kernel built with {@link createKernel}: data layer, queue, crons and telemetry. */
export async function startApp(
  kernel: Kernel,
  config: Pick<AppConfig, "telemetry" | "eventRetentionDays"> = {},
): Promise<Kernel> {
  orchestrator.configure(kernel);
  await orchestrator.bootstrap();
  // Off the startup path: pruning is housekeeping, never a reason to wait.
  commonBoundedContext
    .execute(new CommandPruneEventHistory(config.eventRetentionDays))
    .catch((error: unknown) =>
      logger.warn("Event history pruning failed", errorAttributes(error)),
    );

  if (config.telemetry) {
    await initTelemetry(config.telemetry);
  }

  return kernel;
}

export function createApp(config: AppConfig = {}): Promise<Kernel> {
  return startApp(createKernel(config), config);
}
