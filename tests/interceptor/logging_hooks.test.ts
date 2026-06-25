import assert from "node:assert/strict";
import test from "node:test";

import {
  interceptClass,
  interceptInstance,
} from "../../sincpro_mobile/infrastructure/interceptor/intercept.ts";
import { loggingHooks } from "../../sincpro_mobile/infrastructure/interceptor/logging_hooks.ts";

// ---------------------------------------------------------------------------
// Helper — capture logger calls
// ---------------------------------------------------------------------------

function captureLogger() {
  const debug: unknown[][] = [];
  const info: unknown[][] = [];
  const errors: unknown[][] = [];
  return {
    debug,
    info,
    errors,
    logger: {
      debug: (...args: unknown[]) => debug.push(args),
      info: (...args: unknown[]) => info.push(args),
      error: (...args: unknown[]) => errors.push(args),
    },
  };
}

// ---------------------------------------------------------------------------
// interceptClass + loggingHooks — workflow / service shape
// ---------------------------------------------------------------------------

test("loggingHooks: logs entry and success for each method via interceptClass", async () => {
  class SyncDistributionWorkflow {
    async pullRouteData(): Promise<string[]> {
      return ["route-1", "route-2"];
    }
    async syncOrders(): Promise<void> {}
  }

  const cap = captureLogger();
  interceptClass(SyncDistributionWorkflow, loggingHooks(cap.logger));

  const wf = new SyncDistributionWorkflow();
  await wf.pullRouteData();
  await wf.syncOrders();

  assert.equal(cap.debug.length, 2);
  assert.ok((cap.debug[0][0] as string).includes("pullRouteData"));
  assert.ok((cap.debug[1][0] as string).includes("syncOrders"));

  assert.equal(cap.info.length, 2);
  assert.ok((cap.info[0][0] as string).includes("✓"));
  assert.equal(cap.errors.length, 0);
});

test("loggingHooks: logs error and skips success log on failure", async () => {
  class CustomerService {
    async getByRemoteId(_id: string): Promise<{ name: string }> {
      throw new Error("remote unavailable");
    }
  }

  const cap = captureLogger();
  interceptClass(CustomerService, loggingHooks(cap.logger));

  await assert.rejects(
    () => new CustomerService().getByRemoteId("r-42"),
    /remote unavailable/,
  );

  assert.equal(cap.debug.length, 1, "before fires");
  assert.equal(cap.info.length, 0, "after must not fire on error");
  assert.equal(cap.errors.length, 1, "onError fires");
  assert.ok((cap.errors[0][0] as string).includes("✗"));
  assert.ok((cap.errors[0][0] as string).includes("getByRemoteId"));
  assert.ok(cap.errors[0][1] instanceof Error);
});

test("loggingHooks: log lines include className and methodName", () => {
  class OrderRepository {
    findAll(): string[] {
      return [];
    }
  }

  const cap = captureLogger();
  interceptClass(OrderRepository, loggingHooks(cap.logger));
  new OrderRepository().findAll();

  const debugLine = cap.debug[0][0] as string;
  const infoLine = cap.info[0][0] as string;

  assert.ok(debugLine.includes("OrderRepository"), `debug missing className: ${debugLine}`);
  assert.ok(debugLine.includes("findAll"), `debug missing methodName: ${debugLine}`);
  assert.ok(infoLine.includes("OrderRepository"), `info missing className: ${infoLine}`);
  assert.ok(infoLine.includes("findAll"), `info missing methodName: ${infoLine}`);
});

// ---------------------------------------------------------------------------
// interceptInstance + loggingHooks — singleton shape (DBCursor / workflows)
// ---------------------------------------------------------------------------

test("loggingHooks: works with interceptInstance on a singleton", async () => {
  class DistributionWorkflows {
    async configureSettings(_payload: object): Promise<void> {}
    async pullRemoteOrders(): Promise<string[]> {
      return [];
    }
  }

  const cap = captureLogger();
  const workflows = interceptInstance(new DistributionWorkflows(), loggingHooks(cap.logger));

  await workflows.configureSettings({ tenant: "acme" });
  await workflows.pullRemoteOrders();

  assert.equal(cap.debug.length, 2);
  assert.equal(cap.info.length, 2);
  assert.equal(cap.errors.length, 0);
});
