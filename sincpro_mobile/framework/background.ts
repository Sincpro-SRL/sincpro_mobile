import { logger } from "@sincpro/client-framework";
import { EBuiltinCron } from "@sincpro/mobile/entrypoints/cron/EBuiltinCron";
import { errorAttributes } from "@sincpro/mobile/infrastructure/logger";
import {
  runBackgroundTelemetryFlush,
  type TelemetryConfig,
} from "@sincpro/mobile/infrastructure/telemetry";
import { DEFAULT_BACKGROUND_INTERVAL_MIN } from "@sincpro/mobile/infrastructure/telemetry/telemetry_flush_worker";
import {
  BACKGROUND_MIN_INTERVAL,
  defineBackgroundTask,
} from "@sincpro/mobile/infrastructure/workers";

import type { Kernel } from "./kernel";

export interface BackgroundOptions {
  /** Same config the app passes to telemetry: its background flush is defined too. */
  telemetry?: TelemetryConfig;
}

/** Prepares the data layer the way a closed app needs it, then runs the work. */
function inBackground(kernel: Kernel, taskName: string, work: () => Promise<boolean>) {
  return async () => {
    try {
      await kernel.bootstrap();
    } catch (error) {
      logger.error(
        `${taskName}: the app could not start in background`,
        errorAttributes(error),
      );
      return false;
    }
    return work();
  };
}

/**
 * Defines the OS task of every background cron of the kernel, plus the telemetry flush.
 * Call it while the bundle loads (`defineAppShell` does): a closed app woken by the OS
 * evaluates the bundle without mounting React, so the task must already exist and the
 * run prepares the data layer itself. Registering with the scheduler stays with the
 * orchestrator and telemetry, which only do it for active domains and, when the cron
 * asks for it, an authenticated session.
 */
export function defineBackgroundCrons(kernel: Kernel, options: BackgroundOptions = {}): void {
  for (const cron of Object.values(kernel.cronsByKey()).flat()) {
    if (!cron.runsInBackground) continue;
    defineBackgroundTask(
      cron.taskName,
      inBackground(kernel, cron.taskName, () => cron.runOnce()),
    );
  }

  const { telemetry } = options;
  const flushInterval =
    telemetry?.flush?.backgroundIntervalMin ?? DEFAULT_BACKGROUND_INTERVAL_MIN;
  if (telemetry && flushInterval >= BACKGROUND_MIN_INTERVAL) {
    defineBackgroundTask(
      EBuiltinCron.TELEMETRY_FLUSH,
      inBackground(kernel, EBuiltinCron.TELEMETRY_FLUSH, async () => {
        await runBackgroundTelemetryFlush(telemetry);
        return true;
      }),
    );
  }
}
