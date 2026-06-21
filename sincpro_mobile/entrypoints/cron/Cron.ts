import { loggerCronJobs } from "@sincpro/mobile/infrastructure/logger";
import type { CronWorker } from "@sincpro/mobile/infrastructure/workers";

interface SyncState {
  domains: Set<string>;
  isAuthenticated: boolean;
}

export interface SyncResult {
  changed: boolean;
  added: number;
  removed: number;
}

function statesAreEqual(a: SyncState | null, b: SyncState): boolean {
  if (!a) return false;
  if (a.isAuthenticated !== b.isAuthenticated) return false;
  if (a.domains.size !== b.domains.size) return false;
  for (const domain of a.domains) {
    if (!b.domains.has(domain)) return false;
  }
  return true;
}

function calculateDesiredCrons(
  domains: Set<string>,
  isAuthenticated: boolean,
  cronsByKey: Record<string, CronWorker[]>,
): Set<CronWorker> {
  const desired = new Set<CronWorker>();
  for (const domain of domains) {
    const domainCrons = cronsByKey[domain] ?? [];
    for (const cronWorker of domainCrons) {
      if (isAuthenticated || !cronWorker.requiresAuth) {
        desired.add(cronWorker);
      }
    }
  }
  return desired;
}

class Cron {
  private lastSyncState: SyncState | null = null;
  private currentCrons = new Set<CronWorker>();

  async sync(
    domains: Set<string>,
    isAuthenticated: boolean,
    cronsByKey: Record<string, CronWorker[]>,
  ): Promise<SyncResult> {
    const newState: SyncState = { domains: new Set(domains), isAuthenticated };

    if (statesAreEqual(this.lastSyncState, newState)) {
      return { changed: false, added: 0, removed: 0 };
    }

    const desired = calculateDesiredCrons(domains, isAuthenticated, cronsByKey);
    let added = 0;
    let removed = 0;

    for (const cronWorker of this.currentCrons) {
      if (!desired.has(cronWorker)) {
        await cronWorker.waitForIdle();
        await cronWorker.unregister();
        removed++;
      }
    }

    for (const cronWorker of desired) {
      if (!this.currentCrons.has(cronWorker)) {
        await cronWorker.start();
        added++;
      }
    }

    this.currentCrons = desired;
    this.lastSyncState = newState;

    loggerCronJobs.info(
      `Cron.sync: +${added} -${removed} crons (domains=${[...domains].join(",")}, auth=${isAuthenticated})`,
    );

    return { changed: true, added, removed };
  }
}

export const cron = new Cron();
