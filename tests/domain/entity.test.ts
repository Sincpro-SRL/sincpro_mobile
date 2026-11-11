import assert from "node:assert/strict";
import test from "node:test";

import { DomainEvent } from "@sincpro/client-framework";

import { Entity } from "../../sincpro_mobile/domain/entity/entity.ts";

// ---------------------------------------------------------------------------
// Minimal subclass — Entity has a protected constructor
// ---------------------------------------------------------------------------

class TestEntity extends Entity {
  static make(data?: Partial<TestEntity>): TestEntity {
    return TestEntity.obj<TestEntity>(data);
  }
}

class OrderEvent extends DomainEvent {
  static readonly eventName = "test.order.v1.placed";
  static readonly label = "Order";
  orderId: string = "";
}

class ShipEvent extends DomainEvent {
  static readonly eventName = "test.order.v1.shipped";
  static readonly label = "Ship";
  address: string = "";
}

// ---------------------------------------------------------------------------
// record — one flow per save, in order
//
// What an aggregate records before one save is one flow: the stored queue keeps them in
// order and the trace links them by their correlationId.
// ---------------------------------------------------------------------------

test("record: all events in one batch share one flow, the first one's id", () => {
  const entity = TestEntity.make();
  const first = entity.record(OrderEvent, { orderId: "a" });
  entity.record(ShipEvent, { address: "123 St" });

  const events = entity.recordedEvents();
  assert.equal(events.length, 2);
  const [e1, e2] = events;
  assert.equal(e1.correlationId, first, "the first event heads the flow");
  assert.equal(e1.correlationId, e2.correlationId, "batch must share one correlationId");
  assert.equal(e1.event.name, "test.order.v1.placed");
  assert.ok(e1.event instanceof OrderEvent);
  assert.deepEqual(
    entity.eventIds,
    events.map((recorded) => recorded.id),
  );
});

test("record: sequence numbers are 1-based and monotonically increasing", () => {
  const entity = TestEntity.make();
  entity.record(OrderEvent, { orderId: "a" });
  entity.record(ShipEvent, { address: "b" });
  entity.record(OrderEvent, { orderId: "c" });

  const events = entity.recordedEvents();
  assert.deepEqual(
    events.map((e) => e.sequence),
    [1, 2, 3],
  );
});

// ---------------------------------------------------------------------------
// Duplicate guard — record must skip identical values
//
// Without this guard, calling record twice with the same data
// publishes two events, causing double-processing on the subscriber side.
// ---------------------------------------------------------------------------

test("record: duplicate values return the existing id and are not added", () => {
  const entity = TestEntity.make();
  const id1 = entity.record(OrderEvent, { orderId: "dup" });
  const id2 = entity.record(OrderEvent, { orderId: "dup" });

  assert.equal(id1, id2, "duplicate must return the original event id");
  assert.equal(entity.recordedEvents().length, 1, "only one event must be stored");
});

test("record: same event class with different values is NOT a duplicate", () => {
  const entity = TestEntity.make();
  entity.record(OrderEvent, { orderId: "aaa" });
  entity.record(OrderEvent, { orderId: "bbb" });
  assert.equal(entity.recordedEvents().length, 2);
});

// ---------------------------------------------------------------------------
// pullEvents — batch isolation
//
// After clear, the next batch must start a fresh correlationId.
// If the old correlationId is reused, two independent transactions appear
// as one in distributed tracing.
// ---------------------------------------------------------------------------

test("pullEvents: next batch gets an independent correlationId", () => {
  const entity = TestEntity.make();
  entity.record(OrderEvent, { orderId: "first-batch" });
  const [firstBatchEvent] = entity.recordedEvents();
  const firstCorrelationId = firstBatchEvent.correlationId;

  entity.pullEvents();
  assert.equal(entity.recordedEvents().length, 0);

  entity.record(OrderEvent, { orderId: "second-batch" });
  const [secondBatchEvent] = entity.recordedEvents();
  assert.notEqual(
    secondBatchEvent.correlationId,
    firstCorrelationId,
    "second batch must have a new correlationId",
  );
});

// ---------------------------------------------------------------------------
// recordedEvents — defensive copy contract
//
// Mutating a returned event must not affect the entity's internal state.
// Callers should not be able to silently corrupt the staged event list.
// ---------------------------------------------------------------------------

test("recordedEvents: returns copies — mutating a returned event does not affect entity", () => {
  const entity = TestEntity.make();
  entity.record(OrderEvent, { orderId: "abc" });

  const [copy] = entity.recordedEvents();
  (copy.event as OrderEvent).orderId = "MUTATED";

  const [fresh] = entity.recordedEvents();
  assert.equal((fresh.event as OrderEvent).orderId, "abc");
});

// ---------------------------------------------------------------------------
// equals — identity comparison
// ---------------------------------------------------------------------------

test("equals: same uuid → true", () => {
  const a = TestEntity.make({ uuid: "same-uuid" });
  const b = TestEntity.make({ uuid: "same-uuid" });
  assert.ok(a.equals(b));
});

test("equals: different uuid → false", () => {
  const a = TestEntity.make();
  const b = TestEntity.make();
  assert.ok(!a.equals(b));
});

test("equals: null/undefined → false", () => {
  const entity = TestEntity.make();
  assert.ok(!entity.equals(null as any));
  assert.ok(!entity.equals(undefined as any));
});

// ---------------------------------------------------------------------------
// copyRecordedFrom — entity transplant
//
// Used when domain logic moves events from one aggregate to another. The transplanted
// events belong to the TARGET: new ids, in the target's own flow.
// ---------------------------------------------------------------------------

test("copyRecordedFrom: transplanted events join the target's flow under new ids", () => {
  const source = TestEntity.make();
  source.record(OrderEvent, { orderId: "from-source" });

  const target = TestEntity.make();
  target.copyRecordedFrom(source);

  const [original] = source.recordedEvents();
  const [transplanted] = target.recordedEvents();
  assert.equal((transplanted.event as OrderEvent).orderId, "from-source");
  assert.notEqual(transplanted.id, original.id);
  assert.notEqual(transplanted.correlationId, original.correlationId);
  assert.deepEqual(target.eventIds, [transplanted.id]);
});
