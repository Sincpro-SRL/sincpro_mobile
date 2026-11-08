import type { IMigration } from "@sincpro/mobile/domain/database";
import {
  applyMigrationStep,
  migrationsNewerThanApp,
  pendingMigrations,
  resetPlan,
} from "@sincpro/mobile/domain/database/migration_plan";
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
import { onceUntilFailure } from "@sincpro/mobile/tools/utils/once";

import type { DomainModule } from "./domain_module";

export class Kernel {
  private readonly modules: DomainModule[];
  private crons?: Record<string, CronWorker[]>;
  private readonly prepare = onceUntilFailure(async () => {
    repos.register(this.repositories());
    initializeRepositoryFacade(repos);
    await this.runMigrations();
  });

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

  /** Read once: the shell, the orchestrator and the cron config share the same instances. */
  cronsByKey(): Record<string, CronWorker[]> {
    if (!this.crons) {
      const map: Record<string, CronWorker[]> = {};
      for (const module of this.modules) {
        map[module.key] = module.crons();
      }
      this.crons = map;
    }
    return this.crons;
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
    const migrations = this.migrations();
    const newer = migrationsNewerThanApp(
      applied,
      migrations.map((migration) => migration.name),
    );
    if (newer.length > 0) {
      throw new Error(`the database is newer than this app: ${newer.join(", ")}`);
    }
    for (const migration of pendingMigrations(migrations, applied)) {
      logger.info(`Running migration: ${migration.name}`);
      await applyMigrationStep(
        migration,
        (work) => DBCursor.transaction(work),
        markMigrationApplied,
      );
      applied.add(migration.name);
    }
  }

  /**
   * Registers repositories and runs migrations once per JS context. The app launch and a
   * background task woken by the OS can both ask for it; a failure allows a later retry.
   */
  bootstrap(): Promise<void> {
    return this.prepare();
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
