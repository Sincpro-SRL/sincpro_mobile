import type { IMigration } from "../../domain/database";
import type { Subscriber } from "../../domain/subscriber";
import type { CronWorker } from "../../infrastructure/workers";

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
