import { CronWorker } from "@sincpro/mobile/infrastructure/workers/CronWorker";

import type { LokiClient } from "./config";
import { createFlushJobState, runFlushJob } from "./flush_job";
import type { TelemetryQueueRepository } from "./queue_repository";

const FLUSH_INTERVAL_MIN = 1;

export class TelemetryFlushCron {
  private readonly cron: CronWorker;

  constructor(client: LokiClient, queue: TelemetryQueueRepository) {
    const state = createFlushJobState();
    this.cron = new CronWorker(
      "TELEMETRY_FLUSH",
      () => runFlushJob(client, queue, state),
      FLUSH_INTERVAL_MIN,
    );
  }

  start(): Promise<void> {
    return this.cron.start();
  }

  stop(): Promise<void> {
    return this.cron.unregister();
  }
}
