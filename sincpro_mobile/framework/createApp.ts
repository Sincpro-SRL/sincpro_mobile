import type { TelemetryConfig } from "@sincpro/mobile/infrastructure/telemetry";
import { initTelemetry } from "@sincpro/mobile/infrastructure/telemetry";

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
}

export async function createApp(config: AppConfig = {}): Promise<Kernel> {
  const kernel = new Kernel([baseModule, ...(config.domains ?? [])]);
  orchestrator.configure(kernel);
  await orchestrator.bootstrap(); // migrations run here — telemetry_queue is ready

  if (config.telemetry) {
    await initTelemetry(config.telemetry);
  }

  return kernel;
}
