import assert from "node:assert/strict";
import test from "node:test";

import { Entity } from "../../sincpro_mobile/domain/entity/entity.ts";
import { IntegrationEvent } from "../../sincpro_mobile/domain/events/integration_event.ts";

// ---------------------------------------------------------------------------
// Minimal subclass — Entity has a protected constructor
// ---------------------------------------------------------------------------

class TestEntity extends Entity {
  static make(data?: Partial<TestEntity>): TestEntity {
    return TestEntity.obj<TestEntity>(data);
  }
}

class OrderEvent extends IntegrationEvent {
  public readonly name = "OrderEvent";
  public readonly label = "Order";
  public orderId: string = "";
}

class ShipEvent extends IntegrationEvent {
  public readonly name = "ShipEvent";
  public readonly label = "Ship";
  public address: string = "";
}

// ---------------------------------------------------------------------------
// record — correlation + sequence invariants
//
// These properties are what makes distributed tracing and event ordering work.
// If broken, trace IDs are wrong and event replay is out of order.
// ---------------------------------------------------------------------------

test("record: all events in one batch share the same correlationId", () => {
  const entity = TestEntity.make();
  entity.record(OrderEvent, { orderId: "a" });
  entity.record(ShipEvent, { address: "123 St" });

  const events = entity.recordedEvents();
  assert.equal(events.length, 2);
  const [e1, e2] = events;
  assert.ok(e1.correlationId !== null, "correlationId must be set");
  assert.equal(e1.correlationId, e2.correlationId, "batch must share one correlationId");
  assert.equal(e1.causationId, null);
  assert.equal(e1.entityType, "TestEntity");
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

test("record: aggregateId equals the entity uuid", () => {
  const entity = TestEntity.make();
  entity.record(OrderEvent, { orderId: "x" });

  const [event] = entity.recordedEvents();
  assert.equal(event.aggregateId, entity.uuid);
});

// ---------------------------------------------------------------------------
// Duplicate guard — record must skip identical business payload
//
// Without this guard, calling record twice with the same data
// publishes two events, causing double-processing on the subscriber side.
// ---------------------------------------------------------------------------

test("record: duplicate business payload returns existing uuid and is not added", () => {
  const entity = TestEntity.make();
  const id1 = entity.record(OrderEvent, { orderId: "dup" });
  const id2 = entity.record(OrderEvent, { orderId: "dup" });

  assert.equal(id1, id2, "duplicate must return the original event uuid");
  assert.equal(entity.recordedEvents().length, 1, "only one event must be stored");
});

test("record: same event class with different payload is NOT a duplicate", () => {
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

test("recordedEvents: returns clones — mutating a returned event does not affect entity", () => {
  const entity = TestEntity.make();
  entity.record(OrderEvent, { orderId: "abc" });

  const [clone] = entity.recordedEvents() as OrderEvent[];
  (clone as any).orderId = "MUTATED";

  const [fresh] = entity.recordedEvents() as OrderEvent[];
  assert.equal(fresh.orderId, "abc", "internal event must be unaffected by clone mutation");
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
// Used when domain logic moves events from one aggregate to another.
// The transplanted events must be stamped with the TARGET entity's uuid,
// not the source's — otherwise the aggregate link in the event store is wrong.
// ---------------------------------------------------------------------------

test("copyRecordedFrom: transplanted events carry the target entity uuid", () => {
  const source = TestEntity.make();
  source.record(OrderEvent, { orderId: "from-source" });

  const target = TestEntity.make();
  target.copyRecordedFrom(source);

  const [transplanted] = target.recordedEvents();
  assert.equal(transplanted.aggregateId, target.uuid, "must reference the target entity");
  assert.notEqual(
    transplanted.aggregateId,
    source.uuid,
    "must NOT reference the source entity",
  );
});
