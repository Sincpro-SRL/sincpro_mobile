import {
  type CommandType,
  logger,
  loggerAdapter,
  Subscriber,
} from "@sincpro/client-framework";
import type { IMigration } from "@sincpro/mobile/domain/database";
import {
  applyMigrationStep,
  migrationsNewerThanApp,
  pendingMigrations,
  resetPlan,
} from "@sincpro/mobile/domain/database/migration_plan";
import { repos } from "@sincpro/mobile/entrypoints/db/repositories";
import { DBCursor } from "@sincpro/mobile/infrastructure/database";
import { initializeRepositoryFacade } from "@sincpro/mobile/infrastructure/database/mapped";
import {
  appliedMigrationNames,
  forgetMigrations,
  markMigrationApplied,
} from "@sincpro/mobile/infrastructure/database/schema";
import { errorAttributes } from "@sincpro/mobile/infrastructure/logger";
import { registerWebViewHandler } from "@sincpro/mobile/infrastructure/webview/message_handlers";
import type { CronWorker, CronWorkerOpts } from "@sincpro/mobile/infrastructure/workers";
import { onceUntilFailure } from "@sincpro/mobile/tools/utils/once";

import type { DomainModule } from "./domain_module";
import { type LifecycleHook, runLifecycle } from "./lifecycle";

export class Kernel {
  private readonly modules: DomainModule[];
  private crons?: Record<string, CronWorker[]>;
  private extensionsRegistered = false;
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

  /**
   * The queue's one entrypoint while these domains are active: a `Subscriber` that delivers to
   * their modules' bounded contexts — each once, the core's first: their use cases and event
   * handlers — and takes the Commands they consume.
   */
  subscriberFor(activeDomains: ReadonlySet<string>): Subscriber {
    const commands: CommandType[] = [];
    const active = this.modules.filter((module) => activeDomains.has(module.key));
    for (const module of active) {
      for (const command of module.consumes()) {
        if (!commands.includes(command)) commands.push(command);
      }
    }
    const subscriber = new Subscriber("mobile", { commands });
    for (const module of active) {
      for (const boundedContext of module.boundedContexts())
        subscriber.addBus(boundedContext);
    }
    return subscriber;
  }

  /**
   * Registers what every module plugs into the core, once per JS context: WebView message
   * handlers. The core module goes first, so an app's handler wins.
   */
  registerExtensions(): void {
    if (this.extensionsRegistered) return;
    this.extensionsRegistered = true;
    for (const module of this.modules) {
      for (const [type, handler] of Object.entries(module.webViewHandlers())) {
        registerWebViewHandler(type, handler);
      }
    }
  }

  /** Runs a lifecycle hook in every module; a failing one is logged and never stops the app. */
  runHook(hook: LifecycleHook): Promise<void> {
    return runLifecycle(this.modules, hook, (module, error) =>
      logger.error(`[Kernel] ${module}.${hook} failed`, errorAttributes(error)),
    );
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
    loggerAdapter.warn("Restarting database");
    const plan = resetPlan(this.migrations(), this.persistedTables());
    for (const table of plan.drop) {
      loggerAdapter.info(`Dropping table: ${table}`);
      await DBCursor.execAsync(`DROP TABLE IF EXISTS ${table}`);
    }
    await forgetMigrations(plan.forget);
    await this.runMigrations();
  }
}
