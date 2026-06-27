import type { TelemetryConfig } from "@sincpro/mobile/infrastructure/telemetry";
import { initTelemetry } from "@sincpro/mobile/infrastructure/telemetry";
import type { CronWorkerOpts } from "@sincpro/mobile/infrastructure/workers";

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
   * Override display options for any cron by taskName.
   * Useful for showing/hiding toasts on internal crons (CHECK_NETWORK, TELEMETRY_FLUSH, etc.).
   * @example
   * crons: { CHECK_NETWORK: { showToast: true, label: "Verificando conexión" } }
   */
  crons?: Record<string, Partial<CronWorkerOpts>>;
}

export async function createApp(config: AppConfig = {}): Promise<Kernel> {
  const kernel = new Kernel([baseModule, ...(config.domains ?? [])]);
  if (config.crons) kernel.applyCronConfig(config.crons);
  orchestrator.configure(kernel);
  await orchestrator.bootstrap();

  if (config.telemetry) {
    await initTelemetry(config.telemetry);
  }

  return kernel;
}
