import type { Subscriber } from "@sincpro/mobile/domain/event_sourcing";
import { loggerQueueProcessor } from "@sincpro/mobile/infrastructure/logger";
import { EventBus } from "@sincpro/mobile/infrastructure/workers";

import {
  calculateDesiredSubscribers,
  statesAreEqual,
  type SyncState,
} from "./subscriber_filter";

export interface SyncResult {
  changed: boolean;
  added: number;
  removed: number;
}

let isRunning = false;
let lastSyncState: SyncState | null = null;
let currentSubscribers = new Set<Subscriber>();

export const QueueProcessor = {
  start: () => {
    if (isRunning) return;
    isRunning = true;
    EventBus.start();
    loggerQueueProcessor.info("QueueProcessor started");
  },

  stop: () => {
    EventBus.stop();
    isRunning = false;
    loggerQueueProcessor.info("QueueProcessor stopped");
  },

  clearQueue: async () => {
    await EventBus.clearQueue();
  },

  sync: async (
    domains: Set<string>,
    isAuthenticated: boolean,
    subscribersByKey: Record<string, Subscriber[]>,
  ): Promise<SyncResult> => {
    const newState: SyncState = { domains: new Set(domains), isAuthenticated };

    if (statesAreEqual(lastSyncState, newState)) {
      return { changed: false, added: 0, removed: 0 };
    }

    EventBus.stop();
    await EventBus.waitForIdle();

    const desired = calculateDesiredSubscribers(domains, isAuthenticated, subscribersByKey);
    let added = 0;
    let removed = 0;

    for (const subscriber of currentSubscribers) {
      if (!desired.has(subscriber)) {
        EventBus.off(subscriber);
        removed++;
      }
    }

    for (const subscriber of desired) {
      if (!currentSubscribers.has(subscriber)) {
        EventBus.on(subscriber);
        added++;
      }
    }

    currentSubscribers = desired;
    lastSyncState = newState;

    loggerQueueProcessor.info(
      `QueueProcessor.sync: +${added} -${removed} subscribers (domains=${[...domains].join(",")}, auth=${isAuthenticated})`,
    );

    EventBus.start();
    return { changed: true, added, removed };
  },
};
