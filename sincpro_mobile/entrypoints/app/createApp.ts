import { baseModule } from "./base_module";
import type { DomainModule } from "./domain_module";
import { Kernel } from "./kernel";
import { orchestrator } from "./orchestrator";

export interface AppConfig {
  domains?: DomainModule[];
}

export async function createApp(config: AppConfig = {}): Promise<Kernel> {
  const kernel = new Kernel([baseModule, ...(config.domains ?? [])]);
  orchestrator.configure(kernel);
  await orchestrator.bootstrap();
  return kernel;
}
