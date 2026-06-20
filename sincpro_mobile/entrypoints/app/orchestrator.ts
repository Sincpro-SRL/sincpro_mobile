import { cron } from "@sincpro/mobile/entrypoints/cron/Cron";
import { QueueProcessor } from "@sincpro/mobile/entrypoints/queue/QueueProcessor";
import logger from "@sincpro/mobile/infrastructure/logger";
import { AppState, AppStateStatus } from "react-native";

import type { Kernel } from "./kernel";

type AppStateCallback = (state: AppStateStatus) => void;

class Orchestrator {
  private kernel: Kernel | null = null;
  private authenticated = false;
  private activeDomains = new Set<string>();
  private sharedKeys = new Set<string>();
  private appStateSubscription: (() => void) | null = null;
  private appStateCallbacks: AppStateCallback[] = [];
  private mutex: Promise<void> = Promise.resolve();

  configure(kernel: Kernel): void {
    this.kernel = kernel;
    this.authenticated = false;
    this.sharedKeys = new Set(kernel.sharedKeys());
    this.activeDomains = new Set(kernel.keys());
  }

  private requireKernel(): Kernel {
    if (!this.kernel) {
      throw new Error("Orchestrator not configured. Call createApp() first.");
    }
    return this.kernel;
  }

  private async withMutex<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutex;
    let release!: () => void;
    this.mutex = new Promise((resolve) => (release = resolve));
    try {
      await previous;
      return await operation();
    } finally {
      release();
    }
  }

  private async orchestrateQueue(): Promise<void> {
    await QueueProcessor.sync(
      this.activeDomains,
      this.authenticated,
      this.requireKernel().subscribersByKey(),
    );
  }

  private async orchestrateCron(): Promise<void> {
    await cron.sync(
      this.activeDomains,
      this.authenticated,
      this.requireKernel().cronsByKey(),
    );
  }

  private async restoreConsistency(): Promise<void> {
    await this.orchestrateQueue();
    await this.orchestrateCron();
  }

  private initAppStateWatcher(): void {
    if (this.appStateSubscription) return;
    const subscription = AppState.addEventListener("change", async (state) => {
      if (state === "active") {
        await this.restoreConsistency();
      }
      this.appStateCallbacks.forEach((callback) => callback(state));
    });
    this.appStateSubscription = () => subscription.remove();
  }

  async bootstrap(): Promise<void> {
    await this.requireKernel().bootstrap();
    QueueProcessor.start();
    await this.orchestrateQueue();
    await this.orchestrateCron();
    this.initAppStateWatcher();
    logger.info("[Orchestrator] Infrastructure ready");
  }

  async authenticateSession(): Promise<void> {
    this.authenticated = true;
    await this.orchestrateQueue();
    await this.orchestrateCron();
  }

  async restoreSession(): Promise<void> {
    this.authenticated = true;
    await this.orchestrateQueue();
    await this.orchestrateCron();
  }

  async unauthenticateSession(cleanData: boolean = true): Promise<void> {
    this.authenticated = false;
    await this.orchestrateQueue();
    await this.orchestrateCron();
    if (cleanData) {
      await QueueProcessor.clearQueue();
      await this.requireKernel().restartDatabase();
    }
  }

  async enableDomain(key: string): Promise<void> {
    if (this.activeDomains.has(key)) return;
    this.activeDomains.add(key);
    await this.withMutex(async () => {
      await this.orchestrateQueue();
      await this.orchestrateCron();
    });
  }

  async disableDomain(key: string): Promise<void> {
    if (this.sharedKeys.has(key)) return;
    if (!this.activeDomains.has(key)) return;
    this.activeDomains.delete(key);
    await this.withMutex(async () => {
      await this.orchestrateQueue();
      await this.orchestrateCron();
    });
  }

  isSessionAuthenticated(): boolean {
    return this.authenticated;
  }

  subscribeToAppState(callback: AppStateCallback): () => void {
    this.appStateCallbacks.push(callback);
    return () => {
      const index = this.appStateCallbacks.indexOf(callback);
      if (index > -1) {
        this.appStateCallbacks.splice(index, 1);
      }
    };
  }
}

export const orchestrator = new Orchestrator();
