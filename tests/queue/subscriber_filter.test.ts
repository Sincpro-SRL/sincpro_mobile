import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateDesiredSubscribers,
  type HasRequiresAuth,
  statesAreEqual,
  type SyncState,
} from "../../sincpro_mobile/entrypoints/queue/subscriber_filter.ts";

function sub(requiresAuth: boolean, tag = ""): HasRequiresAuth & { tag: string } {
  return { requiresAuth, tag };
}

// ---------------------------------------------------------------------------
// statesAreEqual — no-op guard: prevents EventBus churn when nothing changed
// ---------------------------------------------------------------------------

test("statesAreEqual: null previous state is always unequal", () => {
  const state: SyncState = { domains: new Set(["SALES"]), isAuthenticated: true };
  assert.ok(!statesAreEqual(null, state));
});

test("statesAreEqual: identical domains and auth returns true", () => {
  const a: SyncState = { domains: new Set(["SALES", "INVENTORY"]), isAuthenticated: true };
  const b: SyncState = { domains: new Set(["INVENTORY", "SALES"]), isAuthenticated: true };
  assert.ok(statesAreEqual(a, b));
});

test("statesAreEqual: same domains, different auth returns false", () => {
  const a: SyncState = { domains: new Set(["SALES"]), isAuthenticated: true };
  const b: SyncState = { domains: new Set(["SALES"]), isAuthenticated: false };
  assert.ok(!statesAreEqual(a, b));
});

test("statesAreEqual: superset domains returns false — extra domain is a real change", () => {
  const a: SyncState = { domains: new Set(["SALES"]), isAuthenticated: true };
  const b: SyncState = { domains: new Set(["SALES", "INVENTORY"]), isAuthenticated: true };
  assert.ok(!statesAreEqual(a, b));
});

test("statesAreEqual: subset domains returns false", () => {
  const a: SyncState = { domains: new Set(["SALES", "INVENTORY"]), isAuthenticated: true };
  const b: SyncState = { domains: new Set(["SALES"]), isAuthenticated: true };
  assert.ok(!statesAreEqual(a, b));
});

test("statesAreEqual: same size but disjoint domains returns false", () => {
  const a: SyncState = { domains: new Set(["SALES"]), isAuthenticated: true };
  const b: SyncState = { domains: new Set(["INVENTORY"]), isAuthenticated: true };
  assert.ok(!statesAreEqual(a, b));
});

test("statesAreEqual: empty domains both sides returns true", () => {
  const a: SyncState = { domains: new Set(), isAuthenticated: false };
  const b: SyncState = { domains: new Set(), isAuthenticated: false };
  assert.ok(statesAreEqual(a, b));
});

// ---------------------------------------------------------------------------
// calculateDesiredSubscribers — auth + domain gating
//
// This is the core security invariant of QueueProcessor.sync(): it determines
// which subscribers are active at any given moment. A bug here means events
// are dispatched to the wrong handlers or withheld from the right ones.
// ---------------------------------------------------------------------------

test("calculateDesiredSubscribers: domain not in active set → subscriber excluded", () => {
  const salesSub = sub(false, "sales");
  const result = calculateDesiredSubscribers(new Set(["INVENTORY"]), true, {
    SALES: [salesSub],
  });
  assert.ok(!result.has(salesSub));
  assert.equal(result.size, 0);
});

test("calculateDesiredSubscribers: domain active, auth-public → always included", () => {
  const salesSub = sub(false, "sales-public");
  const result = calculateDesiredSubscribers(
    new Set(["SALES"]),
    false, // not authenticated
    { SALES: [salesSub] },
  );
  assert.ok(
    result.has(salesSub),
    "public subscriber must be included even when unauthenticated",
  );
});

test("calculateDesiredSubscribers: auth-gated subscriber excluded when not authenticated", () => {
  // Default in the framework: requiresAuth = true. Log out → sync subscriber removed.
  const gateSub = sub(true, "auth-gated");
  const result = calculateDesiredSubscribers(new Set(["SALES"]), false, { SALES: [gateSub] });
  assert.ok(
    !result.has(gateSub),
    "auth-gated subscriber must be excluded when not authenticated",
  );
});

test("calculateDesiredSubscribers: auth-gated subscriber included when authenticated", () => {
  const gateSub = sub(true, "auth-gated");
  const result = calculateDesiredSubscribers(new Set(["SALES"]), true, { SALES: [gateSub] });
  assert.ok(result.has(gateSub), "auth-gated subscriber must be included when authenticated");
});

test("calculateDesiredSubscribers: mixed auth in same domain, only public included when unauthenticated", () => {
  const publicSub = sub(false, "public");
  const authSub = sub(true, "auth");
  const result = calculateDesiredSubscribers(new Set(["SALES"]), false, {
    SALES: [publicSub, authSub],
  });
  assert.ok(result.has(publicSub), "public subscriber must pass");
  assert.ok(!result.has(authSub), "auth-gated subscriber must be blocked");
});

test("calculateDesiredSubscribers: multiple active domains merge all their subscribers", () => {
  const salesSub = sub(false, "sales");
  const invSub = sub(false, "inventory");
  const result = calculateDesiredSubscribers(new Set(["SALES", "INVENTORY"]), false, {
    SALES: [salesSub],
    INVENTORY: [invSub],
  });
  assert.ok(result.has(salesSub));
  assert.ok(result.has(invSub));
  assert.equal(result.size, 2);
});

test("calculateDesiredSubscribers: empty domains → empty result regardless of auth", () => {
  const salesSub = sub(false, "sales");
  const result = calculateDesiredSubscribers(new Set(), true, { SALES: [salesSub] });
  assert.equal(result.size, 0);
});

test("calculateDesiredSubscribers: domain active but no subscribers registered → empty result", () => {
  const result = calculateDesiredSubscribers(new Set(["SALES"]), true, {});
  assert.equal(result.size, 0);
});

// Idempotency: same subscriber instance registered under two domains must not be doubled
test("calculateDesiredSubscribers: same subscriber in two domains counted once (Set dedup)", () => {
  const sharedSub = sub(false, "shared");
  const result = calculateDesiredSubscribers(new Set(["SALES", "INVENTORY"]), true, {
    SALES: [sharedSub],
    INVENTORY: [sharedSub],
  });
  assert.equal(result.size, 1, "Set.add is idempotent for the same object reference");
});
