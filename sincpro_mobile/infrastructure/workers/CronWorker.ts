import { logger } from "@sincpro/client-framework";
import { type LabelText } from "@sincpro/mobile/domain/events/label";
import { errorAttributes } from "@sincpro/mobile/infrastructure/logger";
import { publishActivity } from "@sincpro/mobile/infrastructure/ui/activity";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";

export type CronJob = () => Promise<void>;

/** Shortest interval the OS scheduler accepts; shorter crons are foreground intervals. */
export const BACKGROUND_MIN_INTERVAL = 15;

/**
 * Defines the OS task behind a background cron. Expo needs the definition while the
 * bundle loads: a closed app is woken by the OS, evaluates the bundle without mounting
 * React and looks the task up by name.
 */
export function defineBackgroundTask(taskName: string, run: () => Promise<boolean>): void {
  TaskManager.defineTask(taskName, async () =>
    (await run())
      ? BackgroundTask.BackgroundTaskResult.Success
      : BackgroundTask.BackgroundTaskResult.Failed,
  );
}

export interface CronWorkerOpts {
  requiresAuth?: boolean;
  label?: LabelText;
  ui?: boolean;
}

export class CronWorker {
  private stopFn?: () => void;
  private isRegistering = false;
  private isExecuting = false;
  private registrationError?: Error;

  public readonly requiresAuth: boolean;
  public label?: LabelText;
  private ui: boolean;

  constructor(
    public readonly taskName: string,
    private readonly job: CronJob,
    private readonly intervalMin = 15,
    opts: CronWorkerOpts = {},
  ) {
    this.requiresAuth = opts.requiresAuth ?? false;
    this.label = opts.label;
    this.ui = opts.ui ?? false;
  }

  /** Runs through the OS scheduler, also while the app is closed. */
  get runsInBackground(): boolean {
    return this.intervalMin >= BACKGROUND_MIN_INTERVAL;
  }

  /** One run of the job with its activity events. Resolves false when the job failed. */
  runOnce(): Promise<boolean> {
    return this.runWithEvents(this.job);
  }

  configure(opts: Partial<CronWorkerOpts>): void {
    if (opts.label !== undefined) this.label = opts.label;
    if (opts.ui !== undefined) this.ui = opts.ui;
  }

  /**
   * Registers a task with a specified interval and execution logic.
   * If the interval is less than 15 minutes, a repeating job is created using a defined stop function.
   * If the interval is 15 minutes or greater, the task is registered with a task manager and scheduled as a background task.
   *
   * @return {Promise<void>} A promise that resolves when the task registration process is complete.
   */
  async start() {
    if (this.isRegistering) return;
    this.isRegistering = true;

    try {
      logger.info(`Schedule [every ${this.intervalMin} min]: task ${this.taskName}`);
      if (!this.runsInBackground) {
        this.stopFn = this.createIntervalJob(this.job, this.intervalMin);
      } else {
        if (!TaskManager.isTaskDefined(this.taskName)) {
          logger.warn(
            `${this.taskName} defined after launch: it will not run while the app is closed. ` +
              "Return it from a DomainModule so the shell defines it at load time.",
          );
          defineBackgroundTask(this.taskName, () => this.runOnce());
        }
        await BackgroundTask.registerTaskAsync(this.taskName, {
          minimumInterval: this.intervalMin,
        });
      }
      this.registrationError = undefined;
    } catch (error) {
      this.registrationError = error instanceof Error ? error : new Error(String(error));
      logger.warn(`Failed to register task ${this.taskName}`, errorAttributes(error));
      throw error;
    } finally {
      this.isRegistering = false;
    }
  }

  /**
   * Unregisters a background task with the specified task name.
   * If a stop function is defined, it is invoked before unregistering the task.
   *
   * @return {Promise<void>} A promise that resolves when the task has been successfully unregistered.
   */
  async unregister() {
    try {
      if (this.stopFn) {
        this.stopFn();
        this.stopFn = undefined;
      }

      if (this.runsInBackground) {
        await BackgroundTask.unregisterTaskAsync(this.taskName);
      }

      logger.info(`Task ${this.taskName} unregistered successfully`);
    } catch (error) {
      logger.warn(`Failed to unregister task ${this.taskName}`, errorAttributes(error));
      throw error;
    }
  }

  /**
   * Check if the task is properly registered and functioning
   */
  isHealthy(): boolean {
    return !this.registrationError && (this.stopFn !== undefined || this.runsInBackground);
  }

  /**
   * Get any registration error that occurred
   */
  getLastError(): Error | undefined {
    return this.registrationError;
  }

  private createIntervalJob(
    job: () => void | Promise<void>,
    intervalMinutes: number,
  ): () => void {
    this.runWithEvents(job);
    const id = setInterval(
      () => {
        this.runWithEvents(job);
      },
      intervalMinutes * 60 * 1000,
    );

    return () => {
      clearInterval(id);
    };
  }

  private async runWithEvents(job: () => void | Promise<void>): Promise<boolean> {
    this.isExecuting = true;
    const startTime = Date.now();
    this.publish("running");

    try {
      await Promise.resolve(job());
      const duration = Date.now() - startTime;
      logger.debug(`${this.taskName} completed successfully in ${duration}ms`);
      this.publish("succeeded");
      return true;
    } catch (e) {
      const duration = Date.now() - startTime;
      const errorMessage = e instanceof Error ? e.message : String(e);
      logger.error(`${this.taskName} failed after ${duration}ms with error: ${errorMessage}`);
      this.publish("failed", errorMessage);
      return false;
    } finally {
      this.isExecuting = false;
    }
  }

  private publish(status: "running" | "succeeded" | "failed", detail?: string): void {
    publishActivity({
      channel: "cron",
      name: this.taskName,
      label: this.label ?? this.taskName,
      detail,
      status,
      ui: this.ui,
    });
  }

  /**
   * Waits for current job execution to complete (if any).
   * Timeout after 10 seconds to prevent infinite wait.
   */
  async waitForIdle(): Promise<void> {
    if (!this.isExecuting) return;

    const maxWait = 10000;
    const checkInterval = 100;
    let waited = 0;

    while (this.isExecuting && waited < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }

    if (this.isExecuting) {
      logger.warn(`${this.taskName} waitForIdle timed out after 10s`);
    }
  }
}
