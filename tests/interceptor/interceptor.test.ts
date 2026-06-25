import assert from "node:assert/strict";
import test from "node:test";

import type {
  InterceptorHooks,
  MethodCall,
} from "../../sincpro_mobile/infrastructure/interceptor/intercept.ts";
import {
  interceptClass,
  interceptFunction,
  interceptInstance,
} from "../../sincpro_mobile/infrastructure/interceptor/intercept.ts";

function recordingHooks(): {
  calls: MethodCall[];
  results: unknown[];
  errors: unknown[];
  hooks: InterceptorHooks;
} {
  const calls: MethodCall[] = [];
  const results: unknown[] = [];
  const errors: unknown[] = [];
  return {
    calls,
    results,
    errors,
    hooks: {
      before: (call) => calls.push(call),
      after: (_call, result) => results.push(result),
      onError: (_call, error) => errors.push(error),
    },
  };
}

// ---------------------------------------------------------------------------
// interceptClass — service / workflow (sync)
// ---------------------------------------------------------------------------

test("interceptClass: every method on the class is traced", () => {
  class SyncWorkflow {
    step1(): string {
      return "step1";
    }
    step2(): string {
      return "step2";
    }
    step3(): string {
      return "step3";
    }
  }

  const rec = recordingHooks();
  interceptClass(SyncWorkflow, rec.hooks);
  const wf = new SyncWorkflow();
  wf.step1();
  wf.step2();
  wf.step3();

  assert.deepEqual(
    rec.calls.map((c) => c.methodName),
    ["step1", "step2", "step3"],
  );
});

test("interceptClass: return value is unchanged and this-state is preserved", () => {
  class CustomerService {
    private count = 0;
    getById(id: number): { id: number; name: string } {
      this.count++;
      return { id, name: `customer-${id}` };
    }
    callCount(): number {
      return this.count;
    }
  }

  const rec = recordingHooks();
  interceptClass(CustomerService, rec.hooks);
  const svc = new CustomerService();
  const customer = svc.getById(42);
  svc.getById(99);

  assert.deepEqual(customer, { id: 42, name: "customer-42" });
  assert.equal(svc.callCount(), 2);
});

test("interceptClass: hooks receive className, methodName, and args", () => {
  class CustomerService {
    validate(name: string): boolean {
      return name.length > 0;
    }
  }

  const rec = recordingHooks();
  interceptClass(CustomerService, rec.hooks);
  new CustomerService().validate("Acme");

  assert.equal(rec.calls[0].className, "CustomerService");
  assert.equal(rec.calls[0].methodName, "validate");
  assert.deepEqual(rec.calls[0].args, ["Acme"]);
  assert.equal(rec.results[0], true);
});

test("interceptClass: throws if applied twice on the same class", () => {
  class OrderService {
    place(): void {}
  }
  const rec = recordingHooks();
  interceptClass(OrderService, rec.hooks);
  assert.throws(() => interceptClass(OrderService, rec.hooks), /already intercepted/);
});

// ---------------------------------------------------------------------------
// interceptClass — repository (async)
// ---------------------------------------------------------------------------

test("interceptClass: async method — after receives the resolved value", async () => {
  class OrderRepository {
    async findById(id: string): Promise<{ id: string; total: number }> {
      return { id, total: 150 };
    }
  }

  const rec = recordingHooks();
  interceptClass(OrderRepository, rec.hooks);
  const order = await new OrderRepository().findById("ord-1");

  assert.deepEqual(order, { id: "ord-1", total: 150 });
  assert.equal(rec.calls[0].methodName, "findById");
  assert.deepEqual(rec.results[0], { id: "ord-1", total: 150 });
  assert.equal(rec.errors.length, 0);
});

test("interceptClass: async method that throws — onError fires, after does not, error bubbles", async () => {
  class OrderRepository {
    async save(order: { id: string; total: number }): Promise<void> {
      if (order.total < 0) throw new Error("negative total");
    }
  }

  const rec = recordingHooks();
  interceptClass(OrderRepository, rec.hooks);
  await assert.rejects(
    () => new OrderRepository().save({ id: "o1", total: -1 }),
    /negative total/,
  );

  assert.equal(rec.errors.length, 1);
  assert.equal(rec.results.length, 0);
});

test("interceptClass: all repository methods traced in one apply", async () => {
  class OrderRepository {
    async findAll(): Promise<{ id: string }[]> {
      return [{ id: "o1" }];
    }
    async findById(id: string): Promise<{ id: string } | null> {
      return { id };
    }
    async save(_order: { id: string }): Promise<void> {}
  }

  const rec = recordingHooks();
  interceptClass(OrderRepository, rec.hooks);
  const repo = new OrderRepository();
  await repo.findAll();
  await repo.findById("x");
  await repo.save({ id: "x" });

  assert.deepEqual(
    rec.calls.map((c) => c.methodName),
    ["findAll", "findById", "save"],
  );
});

// ---------------------------------------------------------------------------
// interceptInstance — singleton pattern (mirrors DBCursor / distributionWorkflows)
// ---------------------------------------------------------------------------

test("interceptInstance: traces calls without mutating the class prototype", async () => {
  class DbCursor {
    async getAllAsync<T>(sql: string): Promise<T[]> {
      void sql;
      return [] as T[];
    }
    async getFirstAsync<T>(sql: string): Promise<T | null> {
      void sql;
      return null;
    }
  }

  const rec = recordingHooks();
  const cursor = interceptInstance(new DbCursor(), rec.hooks);

  await cursor.getAllAsync("SELECT * FROM orders");
  await cursor.getFirstAsync("SELECT * FROM orders WHERE id = 1");

  assert.deepEqual(
    rec.calls.map((c) => c.methodName),
    ["getAllAsync", "getFirstAsync"],
  );

  // bare instance must not fire hooks — prototype is untouched
  await new DbCursor().getAllAsync("SELECT 1");
  assert.equal(rec.calls.length, 2);
});

test("interceptInstance: non-function properties pass through untouched", () => {
  class Config {
    readonly version = "2.1.0";
    getVersion(): string {
      return this.version;
    }
  }

  const rec = recordingHooks();
  const config = interceptInstance(new Config(), rec.hooks);

  assert.equal(config.version, "2.1.0");
  assert.equal(rec.calls.length, 0);

  assert.equal(config.getVersion(), "2.1.0");
  assert.equal(rec.calls.length, 1);
});

// ---------------------------------------------------------------------------
// interceptFunction — standalone functions / module-level utilities
// ---------------------------------------------------------------------------

test("interceptFunction: sync — return value unchanged, hooks fire", () => {
  function buildRoutePayload(
    routeId: string,
    stops: number,
  ): { routeId: string; stops: number } {
    return { routeId, stops };
  }

  const rec = recordingHooks();
  const traced = interceptFunction(buildRoutePayload, rec.hooks);
  const result = traced("route-42", 5);

  assert.deepEqual(result, { routeId: "route-42", stops: 5 });
  assert.equal(rec.calls[0].methodName, "buildRoutePayload");
  assert.equal(rec.calls[0].className, "");
  assert.deepEqual(rec.calls[0].args, ["route-42", 5]);
  assert.deepEqual(rec.results[0], { routeId: "route-42", stops: 5 });
});

test("interceptFunction: async — after receives resolved value", async () => {
  async function fetchRemoteOrders(tenantId: string): Promise<string[]> {
    return [`order-${tenantId}-1`, `order-${tenantId}-2`];
  }

  const rec = recordingHooks();
  const traced = interceptFunction(fetchRemoteOrders, rec.hooks);
  const orders = await traced("tenant-99");

  assert.deepEqual(orders, ["order-tenant-99-1", "order-tenant-99-2"]);
  assert.equal(rec.errors.length, 0);
  assert.deepEqual(rec.results[0], ["order-tenant-99-1", "order-tenant-99-2"]);
});

test("interceptFunction: throws — onError fires, after does not, error bubbles", async () => {
  async function syncToRemote(_payload: object): Promise<void> {
    throw new Error("network unavailable");
  }

  const rec = recordingHooks();
  const traced = interceptFunction(syncToRemote, rec.hooks);
  await assert.rejects(() => traced({}), /network unavailable/);

  assert.equal(rec.errors.length, 1);
  assert.equal(rec.results.length, 0);
});
