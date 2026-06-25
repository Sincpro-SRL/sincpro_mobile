import { CronWorker } from "@sincpro/mobile/infrastructure/workers/CronWorker";

import type { LokiClient } from "./config";
import type { TelemetryQueueRepository } from "./queue_repository";

const FLUSH_BATCH_SIZE = 100;
const FLUSH_INTERVAL_MIN = 1;

export class TelemetryFlushCron {
  private readonly cron: CronWorker;

  constructor(client: LokiClient, queue: TelemetryQueueRepository) {
    this.cron = new CronWorker(
      "TELEMETRY_FLUSH",
      async () => {
        await queue.pruneExpired();
        const entries = await queue.findPending(FLUSH_BATCH_SIZE);
        if (entries.length === 0) return;
        await client.deliver(entries);
        await queue.removeMany(entries.map((e) => e.id));
      },
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
