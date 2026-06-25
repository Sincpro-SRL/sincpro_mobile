import assert from "node:assert/strict";
import test from "node:test";

import {
  _resetContextManager,
  Context,
  createContextKey,
  getActiveContext,
  getContext,
  PropagateContext,
  runWithContext,
  SetContext,
  WithContext,
} from "../../sincpro_mobile/infrastructure/context_manager/index.ts";

const TENANT = createContextKey<string>("sincpro.tenant");
const DEVICE = createContextKey<{ id: string }>("sincpro.ble.device");

// ---------------------------------------------------------------------------
// Context (immutable)
// ---------------------------------------------------------------------------

// immutability — set must not modify the original
test("Context: set returns a new context, original is unchanged", () => {
  const base = Context.ROOT;
  const next = base.set(TENANT, "clinic-001");

  assert.equal(base.get(TENANT), undefined);
  assert.equal(next.get(TENANT), "clinic-001");
});

// collision-free keys — same description string produces independent keys
test("Context: two keys with the same description are independent", () => {
  const KEY_A = createContextKey<string>("shared.name");
  const KEY_B = createContextKey<string>("shared.name");

  const ctx = Context.ROOT.set(KEY_A, "value-a").set(KEY_B, "value-b");

  assert.equal(ctx.get(KEY_A), "value-a");
  assert.equal(ctx.get(KEY_B), "value-b");
});

// delete — removes only the target key
test("Context: delete removes only the specified key", () => {
  const ctx = Context.ROOT.set(TENANT, "clinic-001").set(DEVICE, { id: "HR-01" });
  const after = ctx.delete(TENANT);

  assert.equal(after.get(TENANT), undefined);
  assert.deepEqual(after.get(DEVICE), { id: "HR-01" });
});

// typed — TypeScript inference is verified by the test compiling without cast
test("Context: get returns correct typed value", () => {
  const ctx = Context.ROOT.set(DEVICE, { id: "BLE-42" });
  const device = ctx.get(DEVICE);
  assert.equal(device?.id, "BLE-42");
});

// ---------------------------------------------------------------------------
// context_api — global active context
// ---------------------------------------------------------------------------

// runWithContext scoping
test("runWithContext: nested context visible inside, outer restored after", () => {
  _resetContextManager();
  try {
    const outer = Context.ROOT.set(TENANT, "outer-clinic");

    runWithContext(outer, () => {
      assert.equal(getContext(TENANT), "outer-clinic");

      const inner = getActiveContext().set(TENANT, "inner-clinic");
      runWithContext(inner, () => {
        assert.equal(getContext(TENANT), "inner-clinic");
      });

      assert.equal(getContext(TENANT), "outer-clinic");
    });

    assert.equal(getContext(TENANT), undefined);
  } finally {
    _resetContextManager();
  }
});

// getContext returns undefined when no context is active
test("getContext: returns undefined for key not in active context", () => {
  _resetContextManager();
  try {
    assert.equal(getContext(TENANT), undefined);
  } finally {
    _resetContextManager();
  }
});

// ---------------------------------------------------------------------------
// PropagateContext decorator (called as function — decorator syntax not
// supported by Node --experimental-strip-types)
// ---------------------------------------------------------------------------

test("PropagateContext: method sees context active at call time", () => {
  _resetContextManager();
  try {
    const results: (string | undefined)[] = [];

    class BleNotificationHandler {
      handle() {
        results.push(getContext(TENANT));
      }
    }
    PropagateContext(BleNotificationHandler);

    const ctx = Context.ROOT.set(TENANT, "hospital-A");
    runWithContext(ctx, () => new BleNotificationHandler().handle());
    assert.deepEqual(results, ["hospital-A"]);
  } finally {
    _resetContextManager();
  }
});

// ---------------------------------------------------------------------------
// WithContext decorator (applied manually to prototype method)
// ---------------------------------------------------------------------------

test("WithContext: enriches context with instance property before method runs", async () => {
  _resetContextManager();
  try {
    const seen: ({ id: string } | undefined)[] = [];

    class DeviceSession {
      device = { id: "HR-Monitor-01" };
      async startReading() {
        seen.push(getContext(DEVICE));
      }
    }

    const proto = DeviceSession.prototype as unknown as Record<string, unknown>;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "startReading")!;
    const decorated = WithContext((ctx, self) =>
      ctx.set(DEVICE, (self as DeviceSession).device),
    )(proto, "startReading", descriptor) as PropertyDescriptor;
    Object.defineProperty(proto, "startReading", decorated);

    await new DeviceSession().startReading();
    assert.deepEqual(seen, [{ id: "HR-Monitor-01" }]);
  } finally {
    _resetContextManager();
  }
});

// ---------------------------------------------------------------------------
// SetContext shorthand
// ---------------------------------------------------------------------------

test("SetContext: sets a static value in context before method runs", () => {
  _resetContextManager();
  try {
    const seen: (string | undefined)[] = [];

    class ReportService {
      generate() {
        seen.push(getContext(TENANT));
      }
    }

    const proto = ReportService.prototype as unknown as Record<string, unknown>;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "generate")!;
    const decorated = SetContext(TENANT, "default-clinic")(
      proto,
      "generate",
      descriptor,
    ) as PropertyDescriptor;
    Object.defineProperty(proto, "generate", decorated);

    new ReportService().generate();
    assert.deepEqual(seen, ["default-clinic"]);
  } finally {
    _resetContextManager();
  }
});
