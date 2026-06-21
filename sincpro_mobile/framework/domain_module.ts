import type { IMigration } from "@sincpro/mobile/domain/database";
import type { Subscriber } from "@sincpro/mobile/domain/event_sourcing";
import type { CronWorker } from "@sincpro/mobile/infrastructure/workers";

export abstract class DomainModule {
  abstract readonly key: string;
  abstract readonly name: string;
  readonly shared: boolean = false;

  repositories(): Record<string, object> {
    return {};
  }

  migrations(): IMigration[] {
    return [];
  }

  subscribers(): Subscriber[] {
    return [];
  }

  crons(): CronWorker[] {
    return [];
  }

  persistOnReset(): string[] {
    return [];
  }
}
