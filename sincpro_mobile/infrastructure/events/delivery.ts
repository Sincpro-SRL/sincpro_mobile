import {
  type DomainEvent,
  type Envelope,
  type Handled,
  type HearingContext,
  Publisher,
  type StoredEvent,
  storedQueue,
  Subscriber,
  type Subscribes,
} from "@sincpro/client-framework";
import { eventStore } from "@sincpro/mobile/adapters/repositories/sqlite_event_store";
import {
  deliveryNeedsOf,
  InternetIsDownEvent,
  InternetIsUpEvent,
  labelOf,
  showsDelivery,
} from "@sincpro/mobile/domain/events";
import { publishActivity } from "@sincpro/mobile/infrastructure/ui/activity";
import { UIEventBus } from "@sincpro/mobile/infrastructure/ui/UIEventBus";

/** The reason a failure that means "no connection" declares (`DomainNetworkError`). */
export const NETWORK_DOWN = "NETWORK_DOWN";

/**
 * Who hears events now: the bounded contexts and `Subscriptions` of the active modules, behind
 * one `Subscribes` for the whole life of the app.
 *
 * Context: the stored queue takes its subscriber once, and there is one drainer; what changes when
 * a domain is turned on or off is who is behind it (`use`). It also tells the activity a delivery
 * started, which the queue does not say.
 */
class Hearing implements Subscribes {
  private current = new Subscriber();

  use(parties: readonly HearingContext[]): void {
    this.current = new Subscriber(...parties);
  }

  eventTypeOf(name: string) {
    return this.current.eventTypeOf(name);
  }

  handle(
    event: DomainEvent,
    envelope?: Envelope,
    skip?: readonly string[],
  ): Promise<Handled[]> {
    const type = this.eventTypeOf(event.name);
    publishActivity({
      channel: "queue",
      name: event.name,
      label: labelOf(type, event.name),
      status: "running",
      ui: showsDelivery(type),
    });
    return this.current.handle(event, envelope, skip);
  }
}

const SETTLED_STATUS = {
  delivered: "succeeded",
  set_aside: "failed",
  pending: "idle",
} as const;

/**
 * The delivery of stored events on a phone: `storedQueue` over SQLite, the active modules
 * behind it, and what a phone adds — when an event may go (its class declares whether it needs
 * a connection or a session), and what its settling tells the screens.
 *
 * Context: storing, ordering, retrying and setting aside are `storedQueue`'s, the same as on the
 * web. An event waits while its class asks for what is missing (`requiresNetwork`,
 * `requiresSession`) and the rest go on; `drain()` runs again when it comes back — the network
 * up, a session started, the app in the foreground. Settling tells the activity toast, the
 * screens that listen to the event's name (`UIEventBus`), and the connectivity: a failure that
 * means there is no connection (`NETWORK_DOWN`) marks the phone offline until it comes back.
 */
class EventDelivery {
  readonly hearing = new Hearing();
  private online = true;
  private session = false;
  private started = false;

  readonly queue = storedQueue({
    store: eventStore,
    subscriber: this.hearing,
    ready: (stored) => this.ready(stored),
    onSettled: (stored) => this.settled(stored),
  });

  /** Publishes events outside a run: the head of their own flow. */
  readonly publisher = new Publisher(this.queue);

  /** Hears the connectivity once per JS context. */
  start(): void {
    if (this.started) return;
    this.started = true;
    UIEventBus.on(InternetIsDownEvent.eventName, () => this.setOnline(false));
    UIEventBus.on(InternetIsUpEvent.eventName, () => this.setOnline(true));
  }

  /** Who hears events from now on: the parties of the active modules. */
  use(parties: readonly HearingContext[]): void {
    this.hearing.use(parties);
    eventStore.useCatalog((name) => this.hearing.eventTypeOf(name));
  }

  drain(): Promise<void> {
    return this.queue.drain();
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

  private ready(stored: StoredEvent): boolean {
    const needs = deliveryNeedsOf(this.hearing.eventTypeOf(stored.envelope.name));
    return (!needs.network || this.online) && (!needs.session || this.session);
  }

  private settled(stored: StoredEvent): void {
    const name = stored.envelope.name;
    const type = this.hearing.eventTypeOf(name);
    const detail = stored.failures.map((failure) => failure.message).join("; ");
    publishActivity({
      channel: "queue",
      name,
      label: labelOf(type, name),
      detail: detail || undefined,
      status: SETTLED_STATUS[stored.state],
      ui: showsDelivery(type),
    });
    UIEventBus.emit(name, stored);
    if (stored.failures.some((failure) => failure.reason === NETWORK_DOWN) && this.online) {
      this.online = false;
      UIEventBus.emit(InternetIsDownEvent.eventName);
    }
  }
}

export const eventDelivery = new EventDelivery();
