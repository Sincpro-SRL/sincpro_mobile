import { DomainEventRepository } from "@sincpro/mobile/adapters/repositories/domain_event.repository";
import { DomainEventDeadLetterRepository } from "@sincpro/mobile/adapters/repositories/domain_event_dead_letter.repository";
import { EventName, type IntegrationEvent } from "@sincpro/mobile/domain/events";
import { InternetIsDownEvent, InternetIsUpEvent } from "@sincpro/mobile/domain/events";
import { Subscriber } from "@sincpro/mobile/event_driven";
import { DomainNetworkError, RepeatableFailure } from "@sincpro/mobile/exceptions";
import { runWithChain } from "@sincpro/mobile/infrastructure/event_chain";
import { isConsoleDebug, loggerQueueProcessor } from "@sincpro/mobile/infrastructure/logger";
import { declaresUi, publishActivity } from "@sincpro/mobile/infrastructure/ui/activity";
import { UIEventBus } from "@sincpro/mobile/infrastructure/ui/UIEventBus";
import { runIntercepted } from "@sincpro/mobile/infrastructure/workers/interceptors";
import { AppState } from "react-native";

export const PROCESS_WORKER_MAX_ATTEMPTS = 1;
export { EventName };

export class EventBus {
  private static readonly MAX_ATTEMPTS = PROCESS_WORKER_MAX_ATTEMPTS;
  private static readonly INTERVAL_MS = 800;
  private static readonly MAX_INTERVAL_MS = 30000;
  private static readonly BACKOFF_MULTIPLIER = 1.5;

  private static subscribers = new Map<string, Subscriber[]>();

  private static isDraining = false;
  private static running = false;
  private static connectivityReady = false;
  private static lifecycleReady = false;
  private static intervalId: ReturnType<typeof setTimeout> | null = null;
  private static internetConnected = true;
  private static consecutiveFailures = 0;
  private static currentInterval = EventBus.INTERVAL_MS;

  /**
   * The safety-net poll only runs in the foreground. `publish` still drains at
   * once, and coming back to the foreground drains anything left behind.
   */
  private static initLifecycleListener(): void {
    if (this.lifecycleReady || !AppState?.addEventListener) return;
    this.lifecycleReady = true;
    AppState.addEventListener("change", (state) => {
      if (!this.running) return;
      if (state === "active") {
        this.restartPolling();
        void this.triggerProcessing();
        return;
      }
      if (state === "background") this.pausePolling();
    });
  }

  private static pausePolling(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
  }

  static initConnectivityListeners(): void {
    if (this.connectivityReady) return;
    this.connectivityReady = true;

    UIEventBus.on(InternetIsDownEvent.name, () => {
      this.internetConnected = false;
      this.consecutiveFailures++;
      this.adjustInterval();
      loggerQueueProcessor.warn("[NET] offline – Solo eventos locales");
    });

    UIEventBus.on(InternetIsUpEvent.name, () => {
      if (!this.internetConnected) {
        this.internetConnected = true;
        this.consecutiveFailures = 0;
        this.currentInterval = this.INTERVAL_MS;
        this.restartPolling();
        loggerQueueProcessor.info("[NET] online – Reanudando eventos de red");
      }
    });
  }

  private static adjustInterval(): void {
    if (this.consecutiveFailures > 0) {
      this.currentInterval = Math.min(
        this.INTERVAL_MS * Math.pow(this.BACKOFF_MULTIPLIER, this.consecutiveFailures),
        this.MAX_INTERVAL_MS,
      );
      loggerQueueProcessor.debug(
        `Adjusted polling interval to ${this.currentInterval}ms due to ${this.consecutiveFailures} failures`,
      );
    }
  }

  private static restartPolling(): void {
    if (!this.running) return;
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    this.intervalId = setInterval(() => this.triggerProcessing(), this.currentInterval);
  }

  private static async triggerProcessing(): Promise<void> {
    if (this.isDraining) return;

    this.isDraining = true;
    try {
      await this.drainAll();
      if (this.consecutiveFailures > 0) {
        this.consecutiveFailures = 0;
        this.currentInterval = this.INTERVAL_MS;
        this.restartPolling();
      }
    } catch (error) {
      this.consecutiveFailures++;
      this.adjustInterval();
      this.restartPolling();
      loggerQueueProcessor.warn("Error in processing cycle:", error);
    } finally {
      this.isDraining = false;
    }
  }

  static start(): void {
    this.initConnectivityListeners();
    this.initLifecycleListener();
    this.running = true;
    if (this.intervalId) return;

    this.currentInterval = this.INTERVAL_MS;
    this.consecutiveFailures = 0;
    this.intervalId = setInterval(() => this.triggerProcessing(), this.currentInterval);
    loggerQueueProcessor.info("ProcessWorker polling started");
  }

  static stop(): void {
    this.running = false;
    this.pausePolling();
    loggerQueueProcessor.info("ProcessWorker polling stopped");
  }

  /**
   * Waits for current processing cycle to complete (if any).
   * Use before clean() to ensure graceful shutdown.
   * Timeout after 5 seconds to prevent infinite wait.
   */
  static async waitForIdle(): Promise<void> {
    if (!this.isDraining) return;

    const maxWait = 5000;
    const checkInterval = 100;
    let waited = 0;

    while (this.isDraining && waited < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }

    if (this.isDraining) {
      loggerQueueProcessor.warn("EventBus waitForIdle timed out after 5s");
    }
  }

  /**
   * Logs the start and publishes a running activity when a subscriber exists.
   * Returns false if no subscribers (caller should return early).
   */
  private static preProcess(event: IntegrationEvent): boolean {
    const hasSubscribers = this.subscribers.has(event.name);

    loggerQueueProcessor.info(
      `EVENT=${event.name} [${event.label}] (attempt ${event.attempts}/${EventBus.MAX_ATTEMPTS}) - STARTED`,
    );
    if (isConsoleDebug()) {
      loggerQueueProcessor.debug(
        `EVENT=${event.name} uuid=${event.uuid} payload=${event.asJSON()}`,
      );
    }

    if (hasSubscribers) this.publishQueue(event, "running");

    if (!hasSubscribers) {
      loggerQueueProcessor.info(
        `EVENT=${event.name} [${event.label}] - No subscribers: acknowledged`,
      );
    }

    return hasSubscribers;
  }

  /**
   * Handles persistence, emits the event for screens, publishes the activity, logs result.
   * If errors is empty -> success, otherwise -> failure + dead letter + throws.
   * @throws Error if there are any errors
   */
  private static async postProcess(event: IntegrationEvent, errors: string[]): Promise<void> {
    const success = errors.length === 0;
    const errorMessage = errors.join("; ") || undefined;

    if (success) {
      event.markAsAcknowledged();
      await DomainEventRepository.save(event);
      loggerQueueProcessor.info(
        `EVENT=${event.name} [${event.label}] (attempt ${event.attempts}/${EventBus.MAX_ATTEMPTS}) - FINISHED`,
      );
    } else {
      event.markAsFailed(errorMessage!);
      await DomainEventRepository.save(event);
      await DomainEventDeadLetterRepository.save(event, errorMessage!);
      loggerQueueProcessor.warn(
        `EVENT=${event.name} [${event.label}] (attempt ${event.attempts}/${EventBus.MAX_ATTEMPTS}) - FAILED: ${errorMessage}`,
      );
    }

    UIEventBus.emit(event.name, event);
    this.publishQueue(event, success ? "succeeded" : "failed", errorMessage);

    if (!success) {
      throw new Error(errorMessage);
    }
  }

  private static async executeSubscribers(
    event: IntegrationEvent,
    subscriberList: Subscriber[],
  ): Promise<string[]> {
    const errors: string[] = [];

    for (const subscriber of subscriberList) {
      try {
        const typedEvent = subscriber.getEvent(event);
        await runIntercepted(event, subscriber.constructor.name, () =>
          subscriber.process(typedEvent),
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        loggerQueueProcessor.warn(`EVENT=${event.name} - Subscriber failed: ${errorMessage}`);

        if (err instanceof DomainNetworkError || err instanceof RepeatableFailure) {
          if (err instanceof DomainNetworkError) {
            this.internetConnected = false;
            UIEventBus.emit(InternetIsDownEvent.name);
          }
          throw new RepeatableFailure(errorMessage);
        }
        errors.push(errorMessage);
      }
    }

    return errors;
  }

  /**
   * Registers a subscriber for DomainEvent classes.
   * A subscriber can listen to multiple events.
   * Multiple subscribers can listen to the same event.
   * Prevents duplicate registration of the same subscriber instance.
   */
  static on(subscriber: Subscriber): void {
    for (const EventClass of subscriber.listen) {
      if (!EventClass) {
        loggerQueueProcessor.error(
          `Undefined event class in subscriber: ${subscriber.constructor.name}`,
        );
        continue;
      }
      const staticName = (EventClass as unknown as { name: string }).name;
      const eventName =
        staticName && staticName !== "DomainEvent" ? staticName : new EventClass().name;

      if (!this.subscribers.has(eventName)) {
        this.subscribers.set(eventName, []);
      }

      const subscriberList = this.subscribers.get(eventName)!;

      if (subscriberList.includes(subscriber)) {
        loggerQueueProcessor.info(
          `Subscriber already registered for [${eventName}] - skipping`,
        );
        continue;
      }

      subscriberList.push(subscriber);
      loggerQueueProcessor.info(`Subscriber registered for [${eventName}]`);
    }
  }

  static off(subscriber: Subscriber): void {
    for (const EventClass of subscriber.listen) {
      if (!EventClass) continue;

      const staticName = (EventClass as unknown as { name: string }).name;
      const eventName =
        staticName && staticName !== "DomainEvent" ? staticName : new EventClass().name;

      const subscriberList = this.subscribers.get(eventName);
      if (!subscriberList) continue;

      const index = subscriberList.indexOf(subscriber);
      if (index > -1) {
        subscriberList.splice(index, 1);
        loggerQueueProcessor.info(`Subscriber unregistered for [${eventName}]`);
      }

      if (subscriberList.length === 0) {
        this.subscribers.delete(eventName);
      }
    }
  }

  /**
   * Publishes a DomainEvent asynchronously - enqueues for later processing.
   */
  static schedule(): void {
    this.triggerProcessing();
  }

  static async publish(event: IntegrationEvent): Promise<void> {
    if (!event.correlationId) event.applyChain(event.uuid);
    loggerQueueProcessor.info(`EVENT=${event.name} [${event.label}] - Published ASYNC`);
    await DomainEventRepository.save(event);
    this.triggerProcessing();
  }

  /**
   * Publishes a DomainEvent synchronously - executes all subscribers immediately.
   * Saves event to DB for traceability. Moves to dead letter on failure.
   * @throws Error if any subscriber fails or no subscribers registered
   */
  static async publishSync(event: IntegrationEvent): Promise<void> {
    if (!event.correlationId) event.applyChain(event.uuid);
    loggerQueueProcessor.info(`EVENT=${event.name} [${event.label}] - Published SYNC`);

    event.markAsProcessing();
    await DomainEventRepository.save(event);

    if (!this.preProcess(event)) {
      // Nobody consumes it: the fact is recorded and acknowledged, never a failure.
      await this.postProcess(event, []);
      return;
    }

    const subscriberList = this.subscribers.get(event.name)!;
    try {
      const errors = await this.executeSubscribers(event, subscriberList);
      await this.postProcess(event, errors);
    } catch (err) {
      if (err instanceof RepeatableFailure) {
        event.retry();
        await DomainEventRepository.save(event);
        this.publishQueue(event, "idle");
      }
      throw err;
    }
  }

  /**
   * Processes all pending DomainEvents from the domain_events table.
   * Executes ALL subscribers registered for each event.
   * Moves to dead letter queue on failure.
   */
  private static async drainAll(): Promise<void> {
    let event: IntegrationEvent | null;

    while ((event = await DomainEventRepository.findNextPending(this.internetConnected))) {
      const current = event;
      try {
        current.markAsProcessing();
        await DomainEventRepository.save(current);

        if (!this.preProcess(current)) {
          // Nobody consumes it: the fact is recorded and acknowledged, never a failure.
          await this.postProcess(current, []);
          continue;
        }

        const subscriberList = this.subscribers.get(current.name)!;
        const errors = await runWithChain(
          {
            causationId: current.uuid,
            correlationId: current.correlationId ?? current.uuid,
          },
          () => this.executeSubscribers(current, subscriberList),
        );

        await this.postProcess(current, errors);
      } catch (err) {
        if (err instanceof RepeatableFailure) {
          current.retry();
          await DomainEventRepository.save(current);
          this.publishQueue(current, "idle");
          break;
        }
      }
    }
  }

  /**
   * Clears the event queue (domain_events table).
   */
  static async clearQueue(): Promise<void> {
    try {
      await DomainEventRepository.clearAll();
      loggerQueueProcessor.info("ProcessWorker queue cleared");
    } catch (error) {
      loggerQueueProcessor.warn("Failed to clear ProcessWorker queue:", error);
    }
  }

  private static publishQueue(
    event: IntegrationEvent,
    status: "running" | "succeeded" | "failed" | "idle",
    detail?: string,
  ): void {
    publishActivity({
      channel: "queue",
      name: event.name,
      label: event.labelText(),
      detail,
      status,
      ui: declaresUi(event),
    });
  }
}
