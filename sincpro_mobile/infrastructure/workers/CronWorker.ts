import { loggerCronJobs } from "@sincpro/mobile/infrastructure/logger";
import { UIEventBus } from "@sincpro/mobile/infrastructure/ui/UIEventBus";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";

export type CronJob = () => Promise<void>;

export class CronWorker {
  private stopFn?: () => void;
  private isRegistering = false;
  private isExecuting = false;
  private registrationError?: Error;

  constructor(
    public readonly taskName: string,
    private readonly job: CronJob,
    private readonly intervalMin = 15,
    public readonly requiresAuth = false,
    public readonly label?: string,
  ) {}

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
      loggerCronJobs.info(`Schedule [every ${this.intervalMin} min]: task ${this.taskName}`);
      if (this.intervalMin < 15) {
        this.stopFn = this.createIntervalJob(this.job, this.intervalMin);
      } else {
        TaskManager.defineTask(this.taskName, async () => {
          try {
            await this.job();
            return BackgroundTask.BackgroundTaskResult.Success;
          } catch (e) {
            loggerCronJobs.warn(`${this.taskName} error:`, e);
            return BackgroundTask.BackgroundTaskResult.Failed;
          }
        });

        await BackgroundTask.registerTaskAsync(this.taskName, {
          minimumInterval: this.intervalMin,
        });
      }
      this.registrationError = undefined;
    } catch (error) {
      this.registrationError = error instanceof Error ? error : new Error(String(error));
      loggerCronJobs.warn(`Failed to register task ${this.taskName}:`, error);
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

      // Only attempt to unregister background tasks (>= 15 min)
      if (this.intervalMin >= 15) {
        await BackgroundTask.unregisterTaskAsync(this.taskName);
      }

      loggerCronJobs.info(`Task ${this.taskName} unregistered successfully`);
    } catch (error) {
      loggerCronJobs.warn(`Failed to unregister task ${this.taskName}:`, error);
      throw error;
    }
  }

  /**
   * Check if the task is properly registered and functioning
   */
  isHealthy(): boolean {
    return !this.registrationError && (this.stopFn !== undefined || this.intervalMin >= 15);
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

  private async runWithEvents(job: () => void | Promise<void>) {
    this.isExecuting = true;
    const startTime = Date.now();
    UIEventBus.emit("CRON_START", { task: this.taskName, label: this.label });
    try {
      await Promise.resolve(job());
      const duration = Date.now() - startTime;
      loggerCronJobs.debug(`${this.taskName} completed successfully in ${duration}ms`);
    } catch (e) {
      const duration = Date.now() - startTime;
      const errorMessage = e instanceof Error ? e.message : String(e);
      loggerCronJobs.error(
        `${this.taskName} failed after ${duration}ms with error: ${errorMessage}`,
      );
    } finally {
      this.isExecuting = false;
      UIEventBus.emit("CRON_END", { task: this.taskName });
    }
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
      loggerCronJobs.warn(`${this.taskName} waitForIdle timed out after 10s`);
    }
  }
}
