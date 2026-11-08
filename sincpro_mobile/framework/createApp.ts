import { loggerUseCases } from "@sincpro/mobile/infrastructure/logger";
import type { TelemetryConfig } from "@sincpro/mobile/infrastructure/telemetry";
import { initTelemetry } from "@sincpro/mobile/infrastructure/telemetry";
import type { CronWorkerOpts } from "@sincpro/mobile/infrastructure/workers";
import { eventService } from "@sincpro/mobile/services/event.service";

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
}

/** Builds the kernel without IO: safe to call while the bundle loads. */
export function createKernel(config: Pick<AppConfig, "domains" | "crons"> = {}): Kernel {
  const kernel = new Kernel([baseModule, ...(config.domains ?? [])]);
  if (config.crons) kernel.applyCronConfig(config.crons);
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
  eventService
    .pruneHistory(config.eventRetentionDays)
    .catch((error: unknown) => loggerUseCases.warn("Event history pruning failed", error));

  if (config.telemetry) {
    await initTelemetry(config.telemetry);
  }

  return kernel;
}

export function createApp(config: AppConfig = {}): Promise<Kernel> {
  return startApp(createKernel(config), config);
}
