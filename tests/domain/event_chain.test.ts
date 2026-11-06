import assert from "node:assert/strict";
import test from "node:test";

import { Entity } from "../../sincpro_mobile/domain/entity/entity.ts";
import { IntegrationEvent } from "../../sincpro_mobile/domain/event_sourcing/integration_event.ts";
import { _resetContextManager } from "../../sincpro_mobile/infrastructure/context_manager/index.ts";
import { runWithChain } from "../../sincpro_mobile/infrastructure/event_chain.ts";
import { interceptClass } from "../../sincpro_mobile/infrastructure/interceptor/intercept.ts";
import { tracingHooks } from "../../sincpro_mobile/infrastructure/telemetry/tracing/tracing_hooks.ts";

class TestEntity extends Entity {
  static make(): TestEntity {
    return TestEntity.obj<TestEntity>();
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

test("an open execution is the flow; the batch id stays the dedup key", () => {
  const entity = TestEntity.make();
  runWithChain({ causationId: "exec-1", correlationId: "flow-1" }, () => {
    entity.addDomainEvent(OrderEvent, { orderId: "a" });
    entity.addDomainEvent(ShipEvent, { address: "b" });
  });

  const [first, second] = entity.getDomainEvents();
  assert.equal(first.correlationId, "flow-1");
  assert.equal(second.correlationId, "flow-1");
  assert.equal(first.causationId, "exec-1");
  assert.equal(second.causationId, "exec-1");
  assert.equal(first.entityType, "TestEntity");
  assert.equal(first.aggregateId, entity.uuid);
});

test("clearing the batch keeps the flow and changes the dedup key", () => {
  const entity = TestEntity.make();
  runWithChain({ causationId: "exec-1", correlationId: "flow-1" }, () => {
    entity.addDomainEvent(OrderEvent, { orderId: "a" });
    entity.clearDomainEvents();
    entity.addDomainEvent(OrderEvent, { orderId: "b" });
    const next = entity.getDomainEvents()[0];
    assert.equal(next.correlationId, "flow-1");
    assert.equal(next.causationId, "exec-1");
  });
});

test("a traced method opens one flow; a nested method is a new cause in that flow", async () => {
  class Inner {
    async record(entity: TestEntity) {
      entity.addDomainEvent(ShipEvent, { address: "b" });
    }
  }
  class Outer {
    inner = new Inner();
    async record(entity: TestEntity) {
      entity.addDomainEvent(OrderEvent, { orderId: "a" });
      await this.inner.record(entity);
    }
  }

  interceptClass(Inner, tracingHooks("sincpro.mobile.test"));
  interceptClass(Outer, tracingHooks("sincpro.mobile.test"));
  const entity = TestEntity.make();
  try {
    await new Outer().record(entity);
    const [outer, inner] = entity.getDomainEvents();
    assert.equal(outer.correlationId, inner.correlationId);
    assert.notEqual(outer.causationId, inner.causationId);
    assert.equal(outer.causationId, outer.correlationId);
  } finally {
    _resetContextManager();
  }
});
