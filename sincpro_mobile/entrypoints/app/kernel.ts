import type { IMigration } from "../../domain/database";
import type { Subscriber } from "../../domain/subscriber";
import { DBCursor } from "../../infrastructure/database";
import { initializeRepositoryFacade } from "../../infrastructure/database/mapped";
import logger, { loggerRepositories } from "../../infrastructure/logger";
import type { CronWorker } from "../../infrastructure/workers";
import { repos } from "../db/repositories";
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

  async runMigrations(): Promise<void> {
    for (const { name, migrationFn } of this.migrations()) {
      logger.info(`Running migration: ${name}`);
      await migrationFn();
    }
  }

  async bootstrap(): Promise<void> {
    repos.register(this.repositories());
    initializeRepositoryFacade(repos);
    await this.runMigrations();
  }

  async restartDatabase(): Promise<void> {
    loggerRepositories.warn("Restarting database");
    const persisted = this.persistedTables();
    const tablesToDrop = this.migrations().filter(
      (migration) => !persisted.includes(migration.name),
    );
    for (const { name } of tablesToDrop) {
      loggerRepositories.info(`Dropping table: ${name}`);
      await DBCursor.execAsync(`DROP TABLE IF EXISTS ${name}`);
    }
    await this.runMigrations();
  }
}
