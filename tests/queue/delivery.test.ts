import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  BoundedContext,
  Command,
  commandMessageOf,
  CommandNotConsumed,
  DomainEvent,
  envelopeOf,
  Feature,
  Subscriber,
} from "@sincpro/client-framework";

import { eventStore } from "../../sincpro_mobile/adapters/repositories/sqlite_event_store.ts";
import { InternetIsDownEvent } from "../../sincpro_mobile/domain/connectivity/events.ts";
import { newEvent } from "../../sincpro_mobile/domain/events/delivery.ts";
import type { Notice, Notifier } from "../../sincpro_mobile/domain/notifier.ts";
import { PrintImageRequestedEvent } from "../../sincpro_mobile/domain/print/events.ts";
import MIGRATIONS from "../../sincpro_mobile/entrypoints/db/migrations.ts";
import {
  DomainNetworkError,
  DomainValidationError,
  PrinterNotSelected,
  PrinterUnavailable,
  RepeatableFailure,
} from "../../sincpro_mobile/exceptions.ts";
import { DomainModule } from "../../sincpro_mobile/framework/domain_module.ts";
import { Kernel } from "../../sincpro_mobile/framework/kernel.ts";
import { eventDelivery } from "../../sincpro_mobile/infrastructure/events/delivery.ts";
import { eventOutbox } from "../../sincpro_mobile/infrastructure/events/outbox.ts";
import { storedEventOf } from "../../sincpro_mobile/infrastructure/events/stored.ts";
import {
  ACTIVITY_EVENT,
  type ActivityFact,
} from "../../sincpro_mobile/infrastructure/ui/activity.ts";
import { UIEventBus } from "../../sincpro_mobile/infrastructure/ui/UIEventBus.ts";
import {
  CommandPrintImage,
  PrintImage,
} from "../../sincpro_mobile/services/print/print_image.feature.ts";
import type { PrinterService } from "../../sincpro_mobile/services/printer.service.ts";

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

/** Records what it heard, failing first when told to. */
function hear(event: DomainEvent & { value: string }): void {
  const failure = failures.shift();
  if (failure !== undefined) throw failure;
  heard.push(`${event.name}:${event.value}`);
}

class HearSession extends Feature<SessionEvent, void> {
  execute(event: SessionEvent): void {
    hear(event);
  }
}

class HearOffline extends Feature<OfflineEvent, void> {
  execute(event: OfflineEvent): void {
    hear(event);
  }
}

class HearNetwork extends Feature<NetworkEvent, void> {
  execute(event: NetworkEvent): void {
    hear(event);
  }
}

const testsBoundedContext = new BoundedContext("tests");
testsBoundedContext.feature(SessionEvent)(HearSession);
testsBoundedContext.feature(OfflineEvent)(HearOffline);
testsBoundedContext.feature(NetworkEvent)(HearNetwork);

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
  eventDelivery.listen(new Subscriber(testsBoundedContext));
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

class CommandRegisterPayment extends Command<string> {
  constructor(readonly order: string) {
    super();
  }
}

/** One use case, two inputs: a screen executes the Command, the queue delivers the event. */
class RegisterPayment extends Feature<CommandRegisterPayment | OrderPaid, string> {
  execute(input: CommandRegisterPayment | OrderPaid): string {
    heard.push(`payment:${input.order}`);
    return `paid:${input.order}`;
  }
}

const salesBoundedContext = new BoundedContext("sales");
salesBoundedContext.feature([CommandRegisterPayment, OrderPaid])(RegisterPayment);

class SalesModule extends DomainModule {
  readonly key = "SALES";
  readonly name = "Sales";
  override boundedContexts() {
    return [salesBoundedContext];
  }
  override consumes() {
    return [CommandRegisterPayment];
  }
}

test("the queue hands an event to the bounded contexts of the active modules only", async () => {
  const kernel = new Kernel([new SalesModule()]);
  eventDelivery.listen(kernel.subscriberFor(new Set()));
  await publish(newEvent(OrderPaid, { order: "o-1" }));
  assert.deepEqual(heard, [], "an inactive domain hears nothing");

  eventDelivery.listen(kernel.subscriberFor(new Set(["SALES"])));
  await publish(newEvent(OrderPaid, { order: "o-2" }));
  assert.deepEqual(heard, ["payment:o-2"]);
  const [delivered] = await eventStore.inState("delivered");
  assert.equal(delivered?.name, "sales.order.v1.paid");
});

test("a use case registered for a Command and an event answers both", async () => {
  eventDelivery.listen(new Subscriber(salesBoundedContext));
  assert.equal(
    await salesBoundedContext.execute(new CommandRegisterPayment("o-3")),
    "paid:o-3",
  );
  await publish(newEvent(OrderPaid, { order: "o-4" }));
  assert.deepEqual(heard, ["payment:o-3", "payment:o-4"]);
});

test("a message from outside: an event is stored in its flow, a Command runs only when consumed", async () => {
  const kernel = new Kernel([new SalesModule()]);
  eventDelivery.listen(kernel.subscriberFor(new Set(["SALES"])));
  const answered = await eventDelivery.receive({
    headers: {
      ce_id: "0193a000000070008000000000000001",
      ce_type: "sales.order.v1.paid",
      ce_correlationid: "0193a000000070008000000000000000",
    },
    body: JSON.stringify({ name: "sales.order.v1.paid", order: "o-5" }),
  });
  assert.deepEqual(answered, [], "an event is stored, then delivered");
  await eventDelivery.drain();
  assert.deepEqual(heard, ["payment:o-5"]);
  const [stored] = await eventStore.inState("delivered");
  assert.equal(stored?.correlationId, "0193a000000070008000000000000000");

  const [ran] = await eventDelivery.receive(
    commandMessageOf(new CommandRegisterPayment("o-6")),
  );
  assert.deepEqual(ran, { boundedContext: "sales", answer: "paid:o-6" });

  eventDelivery.listen(new Subscriber(salesBoundedContext));
  await assert.rejects(
    eventDelivery.receive(commandMessageOf(new CommandRegisterPayment("o-7"))),
    CommandNotConsumed,
  );
});

test("a use case the queue runs may change who hears; the next event goes to the new one, once", async () => {
  class TurnSalesOn extends DomainEvent {
    static readonly eventName = "test.domain.v1.sales_on";
    static readonly requiresSession = false;
  }
  class SwitchToSales extends Feature<TurnSalesOn, void> {
    execute(): void {
      heard.push("switch");
      eventDelivery.listen(new Subscriber(salesBoundedContext));
    }
  }
  const switchBoundedContext = new BoundedContext("switch");
  switchBoundedContext.feature(TurnSalesOn)(SwitchToSales);
  eventDelivery.listen(new Subscriber(switchBoundedContext));

  await eventDelivery.publisher.publish(new TurnSalesOn());
  await eventDelivery.publisher.publish(newEvent(OrderPaid, { order: "o-8" }));
  await eventDelivery.drain();
  await eventDelivery.drain();
  assert.deepEqual(heard, ["switch", "payment:o-8"]);
  assert.equal((await eventStore.inState("pending")).length, 0);
});

test("the activity of a delivery is told by the process, from its use case's run", async () => {
  eventDelivery.start();
  const facts: ActivityFact[] = [];
  const off = UIEventBus.on(ACTIVITY_EVENT, (fact: ActivityFact) => facts.push(fact), {
    debounce: false,
  });
  failures.push(new DomainValidationError("no"));
  await publish(newEvent(OfflineEvent, { value: "a" }));
  await publish(newEvent(OfflineEvent, { value: "b" }));
  off();
  const statuses = facts
    .filter((fact) => fact.name === "test.offline.v1.fine")
    .map((fact) => fact.status);
  assert.deepEqual(statuses, ["running", "failed", "running", "succeeded"]);
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

/** The print use case over a printer and a notifier of the test's. */
function printing(outcome: () => Promise<void>) {
  const notices: Notice[] = [];
  const notifier: Notifier = { notify: (notice) => void notices.push(notice) };
  const printer = {
    printImage: outcome,
    printFailureActions: () => [{ label: "Impresora", intent: "printer" }],
  } as unknown as PrinterService;
  const printBoundedContext = new BoundedContext<{
    printer: PrinterService;
    notifier: Notifier;
  }>("print");
  printBoundedContext.addDependency("printer", printer);
  printBoundedContext.addDependency("notifier", notifier);
  printBoundedContext.feature([CommandPrintImage, PrintImageRequestedEvent])(PrintImage);
  eventDelivery.listen(new Subscriber(printBoundedContext));
  return { notices, printBoundedContext };
}

const printRequest = (imageBase64: string) =>
  newEvent(PrintImageRequestedEvent, { imageBase64, title: "Ticket 7", jobId: "" });

test("a print whose printer is off fails unavailable and waits to be retried", async () => {
  const { notices } = printing(() => Promise.reject(new PrinterUnavailable("no answer")));
  const envelope = await eventDelivery.publisher.publish(printRequest("abc"));
  await eventDelivery.drain();
  const [waiting] = await eventStore.inState("pending");
  assert.equal(waiting?.failures[0]?.kind, "unavailable");
  assert.equal(waiting?.attempts, 1);
  assert.deepEqual(
    notices.map((notice) => notice.name),
    ["printer.printing", "printer.print_failed"],
  );
  assert.equal(notices[0]?.key, `print:${envelope.id}`, "the request's id keys its notice");
  assert.deepEqual(notices[1]?.actions, [{ label: "Impresora", intent: "printer" }]);
});

test("a print without its image is invalid and set aside; without a printer, domain", async () => {
  printing(() => Promise.reject(new PrinterNotSelected("none")));
  await publish(printRequest(""));
  await publish(printRequest("abc"));
  const kinds = (await eventStore.inState("set_aside"))
    .map((failed) => failed.failures[0]?.kind)
    .sort();
  assert.deepEqual(kinds, ["domain", "invalid"]);
});

test("a print from a screen answers once printed, its notice its own", async () => {
  const { notices, printBoundedContext } = printing(() => Promise.resolve());
  await printBoundedContext.execute(new CommandPrintImage("abc", "Ticket 8"));
  assert.deepEqual(
    notices.map((notice) => `${notice.name}:${notice.message}`),
    ["printer.printing:Ticket 8", "printer.printed:Ticket 8"],
  );
  assert.match(notices[0]?.key ?? "", /^print:[0-9a-f]{32}$/);
});

test("the core's use cases are registered by their decorators, for their Command and event", async () => {
  const { baseModule } = await import("../../sincpro_mobile/framework/base_module.ts");
  const { commonBoundedContext, CommandPrintImage: CorePrintCommand } =
    await import("../../sincpro_mobile/services/index.ts");
  const subscriber = new Kernel([baseModule]).subscriberFor(new Set(["COMMON"]));
  for (const name of [
    "common.print.v1.image_requested",
    "common.webview.v1.message_received",
    "common.settings.added",
    "common.domain.activate",
    "common.domain.deactivate",
  ]) {
    assert.ok(subscriber.eventTypeOf(name), `${name} is heard by the core`);
  }
  assert.ok(commonBoundedContext.handlerOf(CorePrintCommand));
});
