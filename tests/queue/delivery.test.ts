import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  type BoundedContext,
  BoundedContext as Context,
  Command,
  DomainEvent,
  envelopeOf,
  EventSubscriber,
  Feature,
  Subscriptions,
} from "@sincpro/client-framework";

import { eventStore } from "../../sincpro_mobile/adapters/repositories/sqlite_event_store.ts";
import { InternetIsDownEvent } from "../../sincpro_mobile/domain/connectivity/events.ts";
import { newEvent } from "../../sincpro_mobile/domain/events/delivery.ts";
import { PrintImageRequestedEvent } from "../../sincpro_mobile/domain/print/events.ts";
import MIGRATIONS from "../../sincpro_mobile/entrypoints/db/migrations.ts";
import { commonSubscriptions } from "../../sincpro_mobile/entrypoints/queue/index.ts";
import {
  DomainNetworkError,
  DomainValidationError,
  RepeatableFailure,
} from "../../sincpro_mobile/exceptions.ts";
import { DomainModule } from "../../sincpro_mobile/framework/domain_module.ts";
import { Kernel } from "../../sincpro_mobile/framework/kernel.ts";
import { commonBoundedContext } from "../../sincpro_mobile/infrastructure/bounded_context.ts";
import { eventDelivery } from "../../sincpro_mobile/infrastructure/events/delivery.ts";
import { eventOutbox } from "../../sincpro_mobile/infrastructure/events/outbox.ts";
import { storedEventOf } from "../../sincpro_mobile/infrastructure/events/stored.ts";
import { UIEventBus } from "../../sincpro_mobile/infrastructure/ui/UIEventBus.ts";

const heard: string[] = [];
const failures: unknown[] = [];

class SessionEvent extends DomainEvent {
  static readonly eventName = "test.session.v1.needed";
  value = "";
}

class OfflineEvent extends DomainEvent {
  static readonly eventName = "test.offline.v1.fine";
  static readonly requiresSession = false;
  value = "";
}

class NetworkEvent extends DomainEvent {
  static readonly eventName = "test.network.v1.needed";
  static readonly requiresNetwork = true;
  static readonly requiresSession = false;
  value = "";
}

/** A use case of each event: it records what it heard, failing first when told to. */
function hears<E extends DomainEvent & { value: string }>(
  serviceName: string,
): (new () => Feature<E, void>) & { readonly serviceName: string } {
  return class extends Feature<E, void> {
    static readonly serviceName = serviceName;
    execute(event: E): void {
      const failure = failures.shift();
      if (failure !== undefined) throw failure;
      heard.push(`${event.name}:${event.value}`);
    }
  };
}

const testsBoundedContext = new Context("tests");
testsBoundedContext.feature(SessionEvent)(hears("HearSession"));
testsBoundedContext.feature(OfflineEvent)(hears("HearOffline"));
testsBoundedContext.feature(NetworkEvent)(hears("HearNetwork"));

const publish = async (event: DomainEvent) => {
  await eventDelivery.publisher.publish(event);
  await eventDelivery.drain();
};

const stateOf = async (value: string) =>
  (await eventStore.recent(50)).find(
    (record) => (record.payload as { value?: string }).value === value,
  )?.state;

beforeEach(async () => {
  await MIGRATIONS.find((one) => one.name === "stored_events")!.migrationFn();
  await eventDelivery.drain();
  await eventStore.clear();
  heard.length = 0;
  failures.length = 0;
  eventDelivery.use([testsBoundedContext]);
  eventDelivery.setOnline(true);
  eventDelivery.setSession(true);
});

test("an event waits for what its class needs, while the rest go on", async () => {
  eventDelivery.setSession(false);
  eventDelivery.setOnline(false);
  await publish(newEvent(SessionEvent, { value: "s" }));
  await publish(newEvent(NetworkEvent, { value: "n" }));
  await publish(newEvent(OfflineEvent, { value: "o" }));
  assert.deepEqual(heard, ["test.offline.v1.fine:o"]);
  assert.equal(await stateOf("s"), "pending");
  assert.equal(await stateOf("n"), "pending");

  eventDelivery.setOnline(true);
  await eventDelivery.drain();
  assert.deepEqual(heard, ["test.offline.v1.fine:o", "test.network.v1.needed:n"]);

  eventDelivery.setSession(true);
  await eventDelivery.drain();
  assert.deepEqual(heard.at(-1), "test.session.v1.needed:s");
  assert.equal(await stateOf("s"), "delivered");
});

test("a failure a retry may fix waits and holds the line; one that never will is set aside", async () => {
  failures.push(new RepeatableFailure("odoo is restarting"));
  await publish(newEvent(OfflineEvent, { value: "first" }));
  await publish(newEvent(OfflineEvent, { value: "second" }));
  assert.deepEqual(heard, [], "what comes after waits, so the order holds");
  const [waiting] = await eventStore.inState("pending");
  assert.ok(waiting, "the first is still waiting");

  await new Promise((resolve) => setTimeout(resolve, 1100));
  await eventDelivery.drain();
  assert.deepEqual(heard, ["test.offline.v1.fine:first", "test.offline.v1.fine:second"]);

  failures.push(new DomainValidationError("no customer"));
  await publish(newEvent(OfflineEvent, { value: "refused" }));
  await publish(newEvent(OfflineEvent, { value: "after" }));
  assert.equal(await stateOf("refused"), "set_aside");
  assert.equal(await stateOf("after"), "delivered", "a refusal never holds back the rest");
  const [failed] = await eventStore.inState("set_aside");
  assert.equal(failed?.failures[0]?.kind, "invalid");
  assert.equal(failed?.error, "no customer");
});

test("a failure that means no connection marks the phone offline until it comes back", async () => {
  const told: string[] = [];
  const off = UIEventBus.on(InternetIsDownEvent.eventName, () => told.push("down"), {
    debounce: false,
  });
  failures.push(new DomainNetworkError("fetch failed"));
  await publish(newEvent(OfflineEvent, { value: "net" }));
  off();
  assert.equal(eventDelivery.isOnline(), false);
  assert.deepEqual(told, ["down"]);
  await publish(newEvent(NetworkEvent, { value: "later" }));
  assert.equal(await stateOf("later"), "pending");
  eventDelivery.setOnline(true);
});

class OrderPaid extends DomainEvent {
  static readonly eventName = "sales.order.v1.paid";
  static readonly requiresSession = false;
  order = "";
}

class CommandRegisterPayment extends Command<void> {
  constructor(readonly order: string) {
    super();
  }
}

class RegisterPayment extends Feature<CommandRegisterPayment, void> {
  static readonly serviceName = "RegisterPayment";
  execute(command: CommandRegisterPayment): void {
    heard.push(`payment:${command.order}`);
  }
}

class OrderPaidSubscriber extends EventSubscriber<OrderPaid> {
  static readonly subscriberName = "OrderPaid";
  declare readonly salesBoundedContext: BoundedContext;
  async handle(event: OrderPaid): Promise<void> {
    await this.salesBoundedContext.execute(new CommandRegisterPayment(event.order));
  }
}

const salesBoundedContext = new Context("sales");
salesBoundedContext.feature(CommandRegisterPayment)(RegisterPayment);
const salesSubscriptions = new Subscriptions<{ salesBoundedContext: BoundedContext }>(
  "sales-subscriptions",
);
salesSubscriptions.addDependency("salesBoundedContext", salesBoundedContext);
salesSubscriptions.subscribe(OrderPaid)(OrderPaidSubscriber);

class SalesModule extends DomainModule {
  readonly key = "SALES";
  readonly name = "Sales";
  override boundedContexts() {
    return [salesBoundedContext];
  }
  override subscribers() {
    return [salesSubscriptions];
  }
}

test("a module's subscriptions hear an event while its domain is active", async () => {
  const kernel = new Kernel([new SalesModule()]);
  eventDelivery.use(kernel.partiesFor(new Set()));
  await publish(newEvent(OrderPaid, { order: "o-1" }));
  assert.deepEqual(heard, [], "an inactive domain hears nothing");

  eventDelivery.use(kernel.partiesFor(new Set(["SALES"])));
  await publish(newEvent(OrderPaid, { order: "o-2" }));
  assert.deepEqual(heard, ["payment:o-2"]);
  const [delivered] = await eventStore.inState("delivered");
  assert.equal(delivered?.name, "sales.order.v1.paid");
});

test("the core's subscriptions set aside a print request whose image is gone", async () => {
  eventDelivery.use([commonBoundedContext, commonSubscriptions]);
  await publish(newEvent(PrintImageRequestedEvent, { imageBase64: "", title: "ticket" }));
  const [failed] = await eventStore.inState("set_aside");
  assert.equal(failed?.name, "common.print.v1.image_requested");
  assert.equal(failed?.failures[0]?.boundedContext, "common-subscriptions");
  assert.equal(failed?.failures[0]?.kind, "invalid");
});

test("a repository's outbox keeps the message in its transaction, delivered after", async () => {
  const outbox = eventOutbox();
  const event = newEvent(OfflineEvent, { value: "outbox" });
  await outbox.save(storedEventOf(event, envelopeOf(event)));
  assert.equal(await stateOf("outbox"), "pending");
  outbox.schedule();
  await eventDelivery.drain();
  assert.equal(await stateOf("outbox"), "delivered");
  assert.deepEqual(heard, ["test.offline.v1.fine:outbox"]);
});
