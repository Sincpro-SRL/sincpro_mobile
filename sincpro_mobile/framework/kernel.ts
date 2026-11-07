import type { IMigration } from "@sincpro/mobile/domain/database";
import { pendingMigrations, resetPlan } from "@sincpro/mobile/domain/database/migration_plan";
import { repos } from "@sincpro/mobile/entrypoints/db/repositories";
import type { Subscriber } from "@sincpro/mobile/event_driven";
import { DBCursor } from "@sincpro/mobile/infrastructure/database";
import { initializeRepositoryFacade } from "@sincpro/mobile/infrastructure/database/mapped";
import {
  appliedMigrationNames,
  forgetMigrations,
  markMigrationApplied,
} from "@sincpro/mobile/infrastructure/database/schema";
import logger, { loggerRepositories } from "@sincpro/mobile/infrastructure/logger";
import type { CronWorker, CronWorkerOpts } from "@sincpro/mobile/infrastructure/workers";

import type { DomainModule } from "./domain_module";

export class Kernel {
  private readonly modules: DomainModule[];

  constructor(modules: DomainModule[]) {
    this.modules = [...modules].sort((a, b) => Number(b.shared) - Number(a.shared));
  }

  keys(): string[] {
    return this.modules.map((module) => module.key);
  }

  sharedKeys(): string[] {
    return this.modules.filter((module) => module.shared).map((module) => module.key);
  }

  repositories(): Record<string, object> {
    return this.modules.reduce<Record<string, object>>(
      (acc, module) => ({ ...acc, ...module.repositories() }),
      {},
    );
  }

  migrations(): IMigration[] {
    return this.modules.flatMap((module) => module.migrations());
  }

  persistedTables(): string[] {
    return this.modules.flatMap((module) => module.persistOnReset());
  }

  subscribersByKey(): Record<string, Subscriber[]> {
    const map: Record<string, Subscriber[]> = {};
    for (const module of this.modules) {
      map[module.key] = module.subscribers();
    }
    return map;
  }

  cronsByKey(): Record<string, CronWorker[]> {
    const map: Record<string, CronWorker[]> = {};
    for (const module of this.modules) {
      map[module.key] = module.crons();
    }
    return map;
  }

  applyCronConfig(config: Record<string, Partial<CronWorkerOpts>>): void {
    for (const crons of Object.values(this.cronsByKey())) {
      for (const cron of crons) {
        if (config[cron.taskName]) cron.configure(config[cron.taskName]);
      }
    }
  }

  async runMigrations(): Promise<void> {
    const applied = await appliedMigrationNames();
    for (const { name, migrationFn } of pendingMigrations(this.migrations(), applied)) {
      logger.info(`Running migration: ${name}`);
      await migrationFn();
      await markMigrationApplied(name);
      applied.add(name);
    }
  }

  async bootstrap(): Promise<void> {
    repos.register(this.repositories());
    initializeRepositoryFacade(repos);
    await this.runMigrations();
  }

  async restartDatabase(): Promise<void> {
    loggerRepositories.warn("Restarting database");
    const plan = resetPlan(this.migrations(), this.persistedTables());
    for (const table of plan.drop) {
      loggerRepositories.info(`Dropping table: ${table}`);
      await DBCursor.execAsync(`DROP TABLE IF EXISTS ${table}`);
    }
    await forgetMigrations(plan.forget);
    await this.runMigrations();
  }
}
