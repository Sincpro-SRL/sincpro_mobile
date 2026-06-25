import assert from "node:assert/strict";
import test from "node:test";

import {
  Context,
  createContextKey,
  StackContextManager,
} from "../../sincpro_mobile/infrastructure/context_manager/index.ts";

const KEY = createContextKey<string>("test.value");

function fresh() {
  return new StackContextManager();
}

// with() isolation — inner context must not leak to outer scope
test("StackContextManager: with() restores previous context after return", () => {
  const m = fresh();
  const outer = Context.ROOT.set(KEY, "outer");
  const inner = Context.ROOT.set(KEY, "inner");

  m.push(outer);
  m.with(inner, () => {
    assert.equal(m.active().get(KEY), "inner");
  });
  assert.equal(m.active().get(KEY), "outer");
  m.pop();
});

// push/pop — context stays active across async boundary simulation
test("StackContextManager: push keeps context active until pop", () => {
  const m = fresh();
  const ctx = Context.ROOT.set(KEY, "persistent");

  m.push(ctx);
  assert.equal(m.active().get(KEY), "persistent");
  assert.equal(m.active().get(KEY), "persistent");
  m.pop();
  assert.equal(m.active().get(KEY), undefined);
});

// nesting — inner span sees outer as active, outer restored when inner pops
test("StackContextManager: nested push forms correct parent-child stack", () => {
  const m = fresh();
  const ctxA = Context.ROOT.set(KEY, "A");
  const ctxB = Context.ROOT.set(KEY, "B");

  m.push(ctxA);
  assert.equal(m.active().get(KEY), "A");

  m.push(ctxB);
  assert.equal(m.active().get(KEY), "B");

  m.pop();
  assert.equal(m.active().get(KEY), "A");

  m.pop();
  assert.equal(m.active().get(KEY), undefined);
});

// reset() — needed for test teardown
test("StackContextManager: reset() returns to root context", () => {
  const m = fresh();
  m.push(Context.ROOT.set(KEY, "something"));
  m.push(Context.ROOT.set(KEY, "something-else"));
  m.reset();
  assert.equal(m.active().get(KEY), undefined);
  assert.equal(m.active(), Context.ROOT);
});

// pop on empty stack — must not underflow
test("StackContextManager: pop on empty stack is a no-op", () => {
  const m = fresh();
  assert.doesNotThrow(() => {
    m.pop();
    m.pop();
  });
  assert.equal(m.active(), Context.ROOT);
});
