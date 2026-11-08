import assert from "node:assert/strict";
import test from "node:test";

import { defineBackgroundCrons } from "@sincpro/mobile/framework/background";
import { DomainModule } from "@sincpro/mobile/framework/domain_module";
import { Kernel } from "@sincpro/mobile/framework/kernel";
import { initTelemetry } from "@sincpro/mobile/infrastructure/telemetry";
import { CronWorker } from "@sincpro/mobile/infrastructure/workers";
import * as BackgroundTask from "expo-background-task";

type Task = () => Promise<unknown>;
const tasks = (globalThis as { __expoTasks?: Map<string, Task> }).__expoTasks!;
const registered = (globalThis as { __expoRegisteredTasks?: Map<string, unknown> })
  .__expoRegisteredTasks!;

function moduleWith(crons: CronWorker[]): DomainModule {
  return new (class extends DomainModule {
    readonly key = "TEST";
    readonly name = "Test";
    override crons() {
      return crons;
    }
  })();
}

/** A kernel whose data layer only counts how many times it was prepared. */
function countingKernel(crons: CronWorker[], fail = false) {
  const kernel = new Kernel([moduleWith(crons)]);
  const prepared = { count: 0 };
  kernel.bootstrap = async () => {
    prepared.count += 1;
    if (fail) throw new Error("migration failed");
  };
  return { kernel, prepared };
}

test("only background crons get an OS task, defined before anything starts", () => {
  const sync = new CronWorker("BG_SYNC", async () => {}, 15);
  const ping = new CronWorker("FG_PING", async () => {}, 2.5);
  defineBackgroundCrons(countingKernel([sync, ping]).kernel);

  assert.equal(tasks.has("BG_SYNC"), true);
  assert.equal(tasks.has("FG_PING"), false);
  assert.equal(registered.has("BG_SYNC"), false, "registering stays with the orchestrator");
});

test("a task woken by the OS prepares the data layer before the job and reports the outcome", async () => {
  const order: string[] = [];
  const ok = new CronWorker("BG_OK", async () => void order.push("job"), 30);
  const broken = new CronWorker(
    "BG_BROKEN",
    async () => {
      throw new Error("server down");
    },
    30,
  );
  const { kernel, prepared } = countingKernel([ok, broken]);
  const bootstrap = kernel.bootstrap;
  kernel.bootstrap = async () => {
    order.push("bootstrap");
    await bootstrap();
  };
  defineBackgroundCrons(kernel);

  assert.equal(await tasks.get("BG_OK")!(), BackgroundTask.BackgroundTaskResult.Success);
  assert.deepEqual(order, ["bootstrap", "job"]);
  assert.equal(await tasks.get("BG_BROKEN")!(), BackgroundTask.BackgroundTaskResult.Failed);
  assert.equal(prepared.count, 2);
});

test("a data layer that cannot start fails the run without calling the job", async () => {
  let ran = false;
  const cron = new CronWorker("BG_NO_DB", async () => void (ran = true), 15);
  defineBackgroundCrons(countingKernel([cron], true).kernel);

  assert.equal(await tasks.get("BG_NO_DB")!(), BackgroundTask.BackgroundTaskResult.Failed);
  assert.equal(ran, false);
});

test("start() registers a defined task without replacing its load-time definition", async () => {
  const cron = new CronWorker("BG_KEEP", async () => {}, 15);
  defineBackgroundCrons(countingKernel([cron]).kernel);
  const loadTime = tasks.get("BG_KEEP");

  await cron.start();
  assert.equal(tasks.get("BG_KEEP"), loadTime);
  assert.deepEqual(registered.get("BG_KEEP"), { minimumInterval: 15 });

  await cron.unregister();
  assert.equal(registered.has("BG_KEEP"), false);
});

test("a background cron nobody defined at load still works in foreground", async () => {
  let runs = 0;
  const late = new CronWorker("BG_LATE", async () => void (runs += 1), 20);
  await late.start();

  assert.equal(tasks.has("BG_LATE"), true);
  assert.deepEqual(registered.get("BG_LATE"), { minimumInterval: 20 });
  assert.equal(await tasks.get("BG_LATE")!(), BackgroundTask.BackgroundTaskResult.Success);
  assert.equal(runs, 1);
  await late.unregister();
});

test("the kernel reads module crons once, so config and scheduler share instances", () => {
  let reads = 0;
  const module = new (class extends DomainModule {
    readonly key = "ONCE";
    readonly name = "Once";
    override crons() {
      reads += 1;
      return [new CronWorker("BG_ONCE", async () => {}, 15)];
    }
  })();
  const kernel = new Kernel([module]);
  const first = kernel.cronsByKey().ONCE[0];
  kernel.applyCronConfig({ BG_ONCE: { ui: true } });
  assert.equal(kernel.cronsByKey().ONCE[0], first);
  assert.equal(reads, 1);
});

test("bootstrap runs migrations once per context and retries after a failure", async () => {
  let runs = 0;
  const kernel = new (class extends Kernel {
    override async runMigrations() {
      runs += 1;
      if (runs === 1) throw new Error("database locked");
    }
  })([moduleWith([])]);

  await assert.rejects(kernel.bootstrap(), /database locked/);
  await Promise.all([kernel.bootstrap(), kernel.bootstrap()]);
  await kernel.bootstrap();
  assert.equal(runs, 2);
});

test("the telemetry flush gets an OS task only when it runs in background", () => {
  tasks.delete("TELEMETRY_FLUSH");
  defineBackgroundCrons(countingKernel([]).kernel, {
    telemetry: { flush: { backgroundIntervalMin: 5 } },
  });
  assert.equal(
    tasks.has("TELEMETRY_FLUSH"),
    false,
    "under 15 min it is a foreground interval",
  );

  defineBackgroundCrons(countingKernel([]).kernel, { telemetry: {} });
  assert.equal(tasks.has("TELEMETRY_FLUSH"), true, "15 min by default");
});

test("a woken app flushes telemetry without scheduling the task again", async () => {
  const { kernel, prepared } = countingKernel([]);
  defineBackgroundCrons(kernel, { telemetry: {} });
  const loadTime = tasks.get("TELEMETRY_FLUSH");
  registered.delete("TELEMETRY_FLUSH");

  assert.equal(await loadTime!(), BackgroundTask.BackgroundTaskResult.Success);
  assert.equal(prepared.count, 1);
  assert.equal(registered.has("TELEMETRY_FLUSH"), false);
  assert.equal(tasks.get("TELEMETRY_FLUSH"), loadTime);

  // The app opening in this same context registers it, keeping the load-time definition.
  await initTelemetry({});
  assert.deepEqual(registered.get("TELEMETRY_FLUSH"), { minimumInterval: 15 });
  assert.equal(tasks.get("TELEMETRY_FLUSH"), loadTime);
  assert.equal(await loadTime!(), BackgroundTask.BackgroundTaskResult.Success);
});
