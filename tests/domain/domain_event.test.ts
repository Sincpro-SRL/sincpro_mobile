import assert from "node:assert/strict";
import test from "node:test";

import { readEvent } from "../../sincpro_mobile/adapters/repositories/event_row.ts";
import { chainAfter } from "../../sincpro_mobile/domain/events/chain.ts";
import { EEventStatus } from "../../sincpro_mobile/domain/events/domain_event.ts";
import { IntegrationEvent } from "../../sincpro_mobile/domain/events/integration_event.ts";
import { textOf } from "../../sincpro_mobile/domain/events/label.ts";

// ---------------------------------------------------------------------------
// Minimal concrete events for testing
// ---------------------------------------------------------------------------

class OrderEvent extends IntegrationEvent {
  public readonly name = "OrderEvent";
  public readonly label = "Order";
  public orderId: string = "";
  public amount: number = 0;
}

class PaymentEvent extends IntegrationEvent {
  public readonly name = "PaymentEvent";
  public readonly label = "Payment";
  public orderId: string = "";
}

// ---------------------------------------------------------------------------
// hasSameBusinessPayload — the event dedup contract
//
// record uses this to skip events with the same business data.
// If infrastructure fields (uuid, correlationId, attempts…) are incorrectly
// included in the comparison, dedup stops working and events are doubled.
// ---------------------------------------------------------------------------

test("hasSameBusinessPayload: same name + same payload → true", () => {
  const a = OrderEvent.create({ orderId: "123", amount: 100 });
  const b = OrderEvent.create({ orderId: "123", amount: 100 });
  assert.ok(a.hasSameBusinessPayload(b));
});

test("hasSameBusinessPayload: infrastructure fields excluded from comparison", () => {
  const a = OrderEvent.create({ orderId: "456" });
  const b = OrderEvent.create({ orderId: "456" });
  // Mutate all infrastructure fields on b — comparison must still be true
  b.withCorrelationId("totally-different-correlation");
  b.withSequence(99);
  b.markAsProcessing();
  b.markAsProcessing();
  b.markAsFailed("transient network error");
  assert.ok(a.hasSameBusinessPayload(b), "infrastructure mutations must not affect dedup");
});

test("hasSameBusinessPayload: different event name → false", () => {
  const a = OrderEvent.create({ orderId: "123" });
  const b = PaymentEvent.create({ orderId: "123" });
  assert.ok(!a.hasSameBusinessPayload(b));
});

test("hasSameBusinessPayload: same name, different business field → false", () => {
  const a = OrderEvent.create({ orderId: "123", amount: 100 });
  const b = OrderEvent.create({ orderId: "123", amount: 200 });
  assert.ok(!a.hasSameBusinessPayload(b));
});

// ---------------------------------------------------------------------------
// cloneWithReset — retry contract
//
// When an event is retried, it must appear as a fresh event (new uuid, clean
// state). If attempts/status are not reset, the retry counter carries over
// and dead-lettering fires too early.
// ---------------------------------------------------------------------------

test("cloneWithReset: uuid changes so retried event is treated as new", () => {
  const original = OrderEvent.create({ orderId: "789" });
  original.markAsProcessing();
  original.markAsFailed("timeout");
  const clone = original.cloneWithReset();
  assert.notEqual(clone.uuid, original.uuid);
});

test("cloneWithReset: status resets to PENDING and attempts to 0", () => {
  const original = OrderEvent.create({ orderId: "789" });
  original.markAsProcessing();
  original.markAsProcessing();
  const clone = original.cloneWithReset();
  assert.equal(clone.status, EEventStatus.PENDING);
  assert.equal(clone.attempts, 0);
  assert.equal(clone.errorMessage, null);
  assert.equal(clone.acknowledgedAt, null);
  assert.equal(clone.failedAt, null);
});

test("cloneWithReset: business payload preserved", () => {
  const original = OrderEvent.create({ orderId: "789", amount: 500 });
  const clone = original.cloneWithReset() as OrderEvent;
  assert.equal(clone.orderId, "789");
  assert.equal(clone.amount, 500);
});

// ---------------------------------------------------------------------------
// Status lifecycle — markAsProcessing / markAsFailed / retry
//
// These drive the at-least-once delivery mechanism. If markAsProcessing
// doesn't increment attempts, the dead-letter threshold is never reached
// and failed events loop forever.
// ---------------------------------------------------------------------------

test("markAsProcessing: attempts increments monotonically each call", () => {
  const event = OrderEvent.create();
  assert.equal(event.attempts, 0);
  event.markAsProcessing();
  assert.equal(event.attempts, 1);
  event.markAsProcessing();
  assert.equal(event.attempts, 2);
  assert.equal(event.status, EEventStatus.PROCESSING);
});

test("markAsFailed: sets errorMessage and failedAt", () => {
  const event = OrderEvent.create();
  event.markAsProcessing();
  event.markAsFailed("connection refused");
  assert.equal(event.status, EEventStatus.FAILED);
  assert.equal(event.errorMessage, "connection refused");
  assert.ok(event.failedAt !== null, "failedAt must be set");
});

test("retry: reverts to PENDING and clears errorMessage", () => {
  const event = OrderEvent.create();
  event.markAsProcessing();
  event.markAsFailed("timeout");
  event.retry();
  assert.equal(event.status, EEventStatus.PENDING);
  assert.equal(event.errorMessage, null);
});

test("asJSON: the fact leaves delivery out", () => {
  const event = OrderEvent.create({ orderId: "1", amount: 5 });
  event
    .withAggregateId("ent-1")
    .withEntityType("Order")
    .withCorrelationId("flow")
    .withCausationId("cause")
    .withSequence(2);
  event.markAsFailed("timeout");

  const fact = JSON.parse(event.asJSON());
  assert.equal(fact.name, "OrderEvent");
  assert.equal(fact.id, event.uuid);
  assert.deepEqual(fact.label, { default: "Order" });
  assert.equal(fact.created_at, event.createdAt);
  assert.equal(fact.entity_type, "Order");
  assert.equal(fact.entity_id, "ent-1");
  assert.equal(fact.correlation_id, "flow");
  assert.equal(fact.causation_id, "cause");
  assert.equal(fact.entity_version, null);
  assert.equal(fact.sequence, 2);
  assert.equal(fact.orderId, "1");
  assert.equal(fact.amount, 5);
  assert.equal("status" in fact, false);
  assert.equal("attempts" in fact, false);
  assert.equal("errorMessage" in fact, false);
  assert.equal("uuid" in fact, false);
});

test("a class label dictionary round-trips and the string is the fallback language", () => {
  class PaidEvent extends IntegrationEvent {
    static readonly label = { default: "Paid", es: "Pagada", en: "Paid" };
    public readonly name = "PaidEvent";
    public readonly label = textOf(PaidEvent.label);
  }

  const event = PaidEvent.create();
  assert.equal(event.label, "Pagada");
  assert.deepEqual(event.labelText(), PaidEvent.label);
  assert.deepEqual(JSON.parse(event.asJSON()).label, PaidEvent.label);

  const loaded = PaidEvent.fromJSON(event.asJSON());
  assert.equal(loaded.label, "Pagada");
  assert.equal(textOf(loaded.labelText(), "en-US"), "Paid");
});

test("fromJSON: a framework body round-trips, and es is what the screen reads", () => {
  const body = {
    name: "billing.invoice.v1.paid",
    id: "0192",
    label: { default: "Paid", es: "Pagada" },
    created_at: "2026-11-06T05:00:00.000Z",
    entity_type: "Invoice",
    entity_id: "inv",
    correlation_id: "flow",
    causation_id: "prev",
    entity_version: null,
    amount: 5,
    traceparent: "00-aa-bb-01",
  };

  const event = OrderEvent.fromJSON(body);
  assert.equal(event.uuid, "0192");
  assert.equal(event.label, "Pagada");
  assert.equal(event.entityType, "Invoice");
  assert.equal(event.aggregateId, "inv");
  assert.equal(event.correlationId, "flow");
  assert.equal(event.causationId, "prev");
  assert.equal(event.amount, 5);
  assert.equal(event.status, EEventStatus.PENDING);
  assert.deepEqual(JSON.parse(event.asJSON()).label, body.label);
});

test("readEvent: delivery comes from the row, including a legacy blob", () => {
  const event = OrderEvent.create({ orderId: "z", amount: 3 });
  event.withCorrelationId("flow").withCausationId("cause").withSequence(1);
  event.markAsProcessing();

  const loaded = readEvent({
    data: event.asJSON(),
    status: EEventStatus.FAILED,
    attempts: 2,
    error_message: "down",
    failed_at: "2026-11-06T05:00:00.000Z",
    acknowledged_at: null,
    sequence: 4,
    requires_network: 1,
  });
  assert.equal(loaded.status, EEventStatus.FAILED);
  assert.equal(loaded.attempts, 2);
  assert.equal(loaded.errorMessage, "down");
  assert.equal(loaded.sequence, 4);
  assert.equal(loaded.requiresNetwork, true);
  assert.equal(loaded.correlationId, "flow");
  assert.equal((loaded as OrderEvent).orderId, "z");

  const legacy = readEvent({
    data: JSON.stringify({
      name: "OrderEvent",
      label: "Order",
      uuid: "old-id",
      createdAt: "2026-11-06T05:00:00.000Z",
      status: EEventStatus.PROCESSING,
      attempts: 1,
      orderId: "old",
    }),
    status: EEventStatus.ACKNOWLEDGED,
    attempts: 9,
    error_message: null,
    requires_network: 0,
  });
  assert.equal(legacy.status, EEventStatus.ACKNOWLEDGED);
  assert.equal(legacy.attempts, 9);
  assert.equal(legacy.uuid, "old-id");
  assert.equal((legacy as OrderEvent).orderId, "old");
});

test("causedBy: the effect keeps the cause's flow and points at the cause", () => {
  const cause = OrderEvent.create({ orderId: "1" });
  cause.withCorrelationId("flow");
  const effect = PaymentEvent.create({ orderId: "1" }).causedBy(cause);
  assert.equal(effect.causationId, cause.uuid);
  assert.equal(effect.correlationId, "flow");
  assert.equal(cause.correlationId, "flow");
});

test("chainAfter: same four outcomes as the framework chain", () => {
  assert.deepEqual(chainAfter("E1", "C", "own"), {
    causationId: "E1",
    correlationId: "C",
  });
  assert.deepEqual(chainAfter("E1", null, "own"), {
    causationId: "E1",
    correlationId: "E1",
  });
  assert.deepEqual(chainAfter(null, "C", "own"), {
    causationId: null,
    correlationId: "C",
  });
  assert.deepEqual(chainAfter(null, null, "own"), {
    causationId: null,
    correlationId: "own",
  });
});

test("markAsAcknowledged: sets acknowledgedAt and status", () => {
  const event = OrderEvent.create();
  event.markAsProcessing();
  event.markAsAcknowledged();
  assert.equal(event.status, EEventStatus.ACKNOWLEDGED);
  assert.ok(event.acknowledgedAt !== null, "acknowledgedAt must be set");
});
