import assert from "node:assert/strict";
import test from "node:test";

import {
  DomainEvent,
  EEventStatus,
} from "../../sincpro_mobile/domain/event_sourcing/domain_event.ts";

// ---------------------------------------------------------------------------
// Minimal concrete events for testing
// ---------------------------------------------------------------------------

class OrderEvent extends DomainEvent {
  public readonly name = "OrderEvent";
  public readonly label = "Order";
  public orderId: string = "";
  public amount: number = 0;
}

class PaymentEvent extends DomainEvent {
  public readonly name = "PaymentEvent";
  public readonly label = "Payment";
  public orderId: string = "";
}

// ---------------------------------------------------------------------------
// hasSameBusinessPayload — the event dedup contract
//
// addDomainEvent uses this to skip events with the same business data.
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

test("markAsAcknowledged: sets acknowledgedAt and status", () => {
  const event = OrderEvent.create();
  event.markAsProcessing();
  event.markAsAcknowledged();
  assert.equal(event.status, EEventStatus.ACKNOWLEDGED);
  assert.ok(event.acknowledgedAt !== null, "acknowledgedAt must be set");
});
