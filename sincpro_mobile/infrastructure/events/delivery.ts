import {
  type AnyCommand,
  type BinaryMessage,
  DomainEvent,
  type Envelope,
  envelopeFrom,
  eventFrom,
  failureOf,
  type Handled,
  type Message,
  type MessageQueue,
  type MessageStore,
  processListeners,
  Publisher,
  readMessage,
  type RemoteCommand,
  type RemoteEvent,
  type StoredMessage,
  type StoredQueue,
  storedQueue,
  Subscriber,
  verdictOf,
} from "@sincpro/client-framework";
import { eventStore } from "@sincpro/mobile/adapters/repositories/sqlite_event_store";
import {
  declarationOf,
  type DeliveryDeclaration,
  deliveryNeedsOf,
  type EventsConfig,
  InternetIsDownEvent,
  InternetIsUpEvent,
  labelOf,
  showsDelivery,
} from "@sincpro/mobile/domain/events";
import { storedMessageOf } from "@sincpro/mobile/infrastructure/events/stored";
import {
  type ActivityStatus,
  publishActivity,
} from "@sincpro/mobile/infrastructure/ui/activity";
import { UIEventBus } from "@sincpro/mobile/infrastructure/ui/UIEventBus";

/** The reason a failure that means "no connection" declares (`DomainNetworkError`). */
export const NETWORK_DOWN = "NETWORK_DOWN";

/**
 * One generation of the delivery: the `Subscriber` of the modules active then, and the stored
 * queue that hands it what waits. A retired generation finds nothing more in the store — its
 * retry timer included —, so one queue drains the store at a time.
 */
type Generation = {
  readonly subscriber: Subscriber;
  readonly queue: StoredQueue;
  readonly retire: () => void;
};

/** Tells the activity a delivered event's run started, answered or failed. */
function tell(executable: unknown, status: ActivityStatus, detail?: string): void {
  if (!(executable instanceof DomainEvent)) return;
  const type = executable.constructor;
  publishActivity({
    channel: "queue",
    name: executable.name,
    label: labelOf(type, executable.name),
    detail,
    status,
    ui: showsDelivery(type),
  });
}

/**
 * The delivery of stored messages on a phone — the `MessageQueue` every publisher puts events
 * into and sends Commands through: `storedQueue` over SQLite, the active modules' `Subscriber`
 * behind it, and what a phone adds — when a message may go (its class declares whether it needs a
 * connection or a session, the app changes it by name), its policy, a dropped connection, and
 * what its settling tells the screens.
 *
 * Context: storing, ordering and the verdict are `storedQueue`'s, the same as on the web: sent
 * once, a failure set aside — the failed ones —, what goes over the network waits for the other
 * side. A phone extends the verdict, never changes it: a failure that means the phone lost its
 * connection (`NETWORK_DOWN`) waits for the connection to come back, not a time, whatever the
 * message declared. Who hears is said explicitly (`listen`, from `Kernel.subscriberFor`): a `Subscriber` is
 * never changed, a new one takes over. An event waits while its class asks for what is missing
 * (`requiresNetwork`, `requiresSession`) and the rest go on; `drain()` runs again when it comes
 * back — the network up, a session started, the app in the foreground. Settling tells the
 * screens that listen to the event's name (`UIEventBus`) and the connectivity: a failure that
 * means there is no connection (`NETWORK_DOWN`) marks the phone offline until it comes back. The
 * activity ("procesando…") is the process's to tell (`processListeners`), never the queue's door.
 */
class EventDelivery implements MessageQueue {
  private generation: Generation;
  /** The retired generation's last pass: the next one starts after it, never beside it. */
  private handover: Promise<void> = Promise.resolve();
  private online = true;
  private session = false;
  private started = false;
  private config: EventsConfig = {};

  /** Publishes events outside a run: the head of their own flow. */
  readonly publisher = new Publisher(this);

  constructor() {
    this.generation = this.generationOf(new Subscriber());
  }

  /** Who hears what the queue delivers now: the active modules' bounded contexts. */
  get subscriber(): Subscriber {
    return this.generation.subscriber;
  }

  /**
   * What the application sets of its stored messages (`AppConfig.events`): the queue's policy and
   * backoff, and each message's by its name. The current generation is replaced, so it holds for
   * what waits now.
   */
  configure(config: EventsConfig = {}): void {
    this.config = config;
    this.listen(this.subscriber);
  }

  /** Hears the connectivity and tells the activity, once per JS context. */
  start(): void {
    if (this.started) return;
    this.started = true;
    UIEventBus.on(InternetIsDownEvent.eventName, () => this.setOnline(false));
    UIEventBus.on(InternetIsUpEvent.eventName, () => this.setOnline(true));
    processListeners.onStart(({ executable }) => tell(executable, "running"));
    processListeners.onCompletion(({ executable }) => tell(executable, "succeeded"));
    processListeners.onFailure(({ executable, error }) =>
      tell(executable, "failed", error instanceof Error ? error.message : undefined),
    );
  }

  /**
   * From now on `subscriber` hears what the queue delivers — the active modules changed:
   * 1. The current generation retires: the event it is delivering finishes, and it takes no more.
   * 2. A new stored queue over the same store hands what waits to `subscriber`, after the
   *    retired one is done (`drain`). Nothing is awaited here, so a use case the queue is
   *    running may turn a domain on.
   */
  listen(subscriber: Subscriber): void {
    const retired = this.generation;
    retired.retire();
    this.generation = this.generationOf(subscriber);
    this.handover = retired.queue.drain().catch(() => undefined);
    eventStore.useCatalog((name) => subscriber.eventTypeOf(name));
  }

  /** Stores `event` with its envelope, then delivers what waits. */
  async put(event: DomainEvent | RemoteEvent, envelope: Envelope): Promise<void> {
    await eventStore.add(storedMessageOf("event", event, envelope));
    void this.drain().catch(() => undefined);
  }

  /**
   * Stores `command` — an intention, run by the bus that consumes it (`DomainModule.consumes`)
   * when it can, its answer kept —, then delivers what waits.
   */
  async send(command: AnyCommand | RemoteCommand, envelope: Envelope): Promise<void> {
    await eventStore.add(storedMessageOf("command", command, envelope));
    void this.drain().catch(() => undefined);
  }

  /**
   * A message that arrived from outside — a push, a socket, a page —, CloudEvents structured or
   * in binary mode (`ce_` headers), read by `readMessage`:
   * 1. An event the active modules hear is stored with the sender's flow and trace
   *    (`envelopeFrom`), and delivered as one published here: in order, when ready, retried.
   * 2. Anything else goes to the `Subscriber`: a Command it consumes (`DomainModule.consumes`)
   *    runs now, one it does not is `CommandNotConsumed`, one nobody knows is nothing.
   * Final: what each bounded context answered or failed with; nothing for a stored event.
   */
  async receive(arrived: Message | BinaryMessage): Promise<Handled[]> {
    const message = readMessage(arrived);
    const type = this.subscriber.eventTypeOf(message.type);
    if (type === undefined) return this.subscriber.receive(message);
    await this.put(eventFrom(type, message.data), envelopeFrom(message));
    return [];
  }

  async drain(): Promise<void> {
    await this.handover;
    await this.generation.queue.drain();
  }

  setOnline(online: boolean): void {
    const back = online && !this.online;
    this.online = online;
    if (back) void this.drain();
  }

  setSession(session: boolean): void {
    const started = session && !this.session;
    this.session = session;
    if (started) void this.drain();
  }

  isOnline(): boolean {
    return this.online;
  }

  private generationOf(subscriber: Subscriber): Generation {
    let retired = false;
    const store: MessageStore = {
      add: (stored) => eventStore.add(stored),
      next: (skip) => (retired ? undefined : eventStore.next(skip)),
      save: (stored) => eventStore.save(stored),
    };
    return {
      subscriber,
      queue: storedQueue({
        store,
        subscriber,
        ready: (stored) => this.ready(subscriber, stored),
        policy: { retries: this.config.retries, maxAttempts: this.config.maxAttempts },
        policyOf: (stored) => {
          const declared = this.declarationOf(subscriber, stored);
          return {
            retries: declared.retries,
            maxAttempts: declared.maxAttempts,
            requiresNetwork: declared.requiresNetwork,
          };
        },
        verdict: (delivery) =>
          delivery.errors.some((error) => failureOf(error).reason === NETWORK_DOWN) &&
          delivery.attempts < delivery.policy.maxAttempts
            ? { settlement: "wait" }
            : verdictOf(delivery),
        wait: this.config.backoff?.first,
        longestWait: this.config.backoff?.longest,
        onSettled: (stored) => this.settled(stored),
      }),
      retire: () => {
        retired = true;
      },
    };
  }

  /**
   * Whether `stored` may go now: what it needs is there. One the connection dropped under
   * (`NETWORK_DOWN`) needs it, whatever it declared.
   */
  private ready(subscriber: Subscriber, stored: StoredMessage): boolean {
    const needs = deliveryNeedsOf(this.declarationOf(subscriber, stored));
    const cut = stored.failures.some((failure) => failure.reason === NETWORK_DOWN);
    return (!(needs.network || cut) || this.online) && (!needs.session || this.session);
  }

  /** What `stored` declares — its class's, the app's by its name over it. */
  private declarationOf(subscriber: Subscriber, stored: StoredMessage): DeliveryDeclaration {
    const name = stored.envelope.name;
    const type =
      stored.kind === "command"
        ? subscriber.commandTypeOf(name)
        : subscriber.eventTypeOf(name);
    const declared = declarationOf(type);
    const changed = this.config.byName?.[name] ?? {};
    return {
      ...declared,
      ...Object.fromEntries(
        Object.entries(changed).filter(([, value]) => value !== undefined),
      ),
    };
  }

  private settled(stored: StoredMessage): void {
    UIEventBus.emit(stored.envelope.name, stored);
    if (stored.failures.some((failure) => failure.reason === NETWORK_DOWN) && this.online) {
      this.online = false;
      UIEventBus.emit(InternetIsDownEvent.eventName);
    }
  }
}

export const eventDelivery = new EventDelivery();
