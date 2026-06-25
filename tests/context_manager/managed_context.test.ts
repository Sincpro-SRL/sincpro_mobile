import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  _resetContextManager,
  getContext,
} from "../../sincpro_mobile/infrastructure/context_manager/context_api.ts";
import { createContextKey } from "../../sincpro_mobile/infrastructure/context_manager/context_key.ts";
import {
  managed,
  ManagedContext,
} from "../../sincpro_mobile/infrastructure/context_manager/managed_context.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FakeSession {
  id: number;
}

let sessionCounter = 0;
function makeSession(): FakeSession {
  return { id: ++sessionCounter };
}

// ---------------------------------------------------------------------------
// Flavor A — managed() generator
// ---------------------------------------------------------------------------

describe("managed() — generator flavor", () => {
  it("fn receives the yielded value as argument", async () => {
    _resetContextManager();

    let openSession!: FakeSession;
    const scope = managed(async function* () {
      openSession = makeSession();
      yield openSession;
    });

    await scope.use(async (s) => {
      assert.strictEqual(s, openSession);
    });
  });

  it(".get() returns the value while inside use(), undefined outside", async () => {
    _resetContextManager();

    const scope = managed(async function* () {
      yield makeSession();
    });

    assert.strictEqual(scope.get(), undefined);
    await scope.use(async () => {
      assert.ok(scope.get(), "should be defined inside use()");
    });
    assert.strictEqual(scope.get(), undefined);
  });

  it("runs commit path (no error) — generator resumes after yield", async () => {
    _resetContextManager();

    let committed = false;
    const scope = managed(async function* () {
      try {
        yield makeSession();
        committed = true;
      } catch {
        // rollback path
      }
    });

    await scope.use(async () => {});
    assert.ok(committed);
  });

  it("runs rollback path when fn throws, re-throws the error", async () => {
    _resetContextManager();

    let rolledBack = false;
    const scope = managed(async function* () {
      try {
        yield makeSession();
      } catch {
        rolledBack = true;
      }
    });

    await assert.rejects(
      () =>
        scope.use(async () => {
          throw new Error("boom");
        }),
      /boom/,
    );
    assert.ok(rolledBack);
  });

  it("clears context after use() throws (no leak)", async () => {
    _resetContextManager();

    const scope = managed(async function* () {
      try {
        yield makeSession();
      } catch {
        /* ok */
      }
    });

    await assert.rejects(() =>
      scope.use(async () => {
        throw new Error("x");
      }),
    );
    assert.strictEqual(scope.get(), undefined);
  });

  it("shared key — value also readable via getContext(key)", async () => {
    _resetContextManager();

    const MY_KEY = createContextKey<FakeSession>("test.shared");
    const scope = managed(async function* () {
      yield makeSession();
    }, MY_KEY);

    await scope.use(async () => {
      assert.ok(scope.get(), "readable via .get()");
      assert.ok(getContext(MY_KEY), "readable via shared key");
      assert.strictEqual(scope.get(), getContext(MY_KEY));
    });
    assert.strictEqual(scope.get(), undefined);
    assert.strictEqual(getContext(MY_KEY), undefined);
  });

  it("inject decorator — value available via .get() inside the decorated method", async () => {
    _resetContextManager();

    const scope = managed(async function* () {
      yield makeSession();
    });

    class Repo {
      async save() {
        assert.ok(scope.get(), "should be defined inside decorated method");
      }
    }
    const descriptor = Object.getOwnPropertyDescriptor(Repo.prototype, "save")!;
    scope.inject(Repo.prototype, "save", descriptor);
    Object.defineProperty(Repo.prototype, "save", descriptor);

    await new Repo().save();
    assert.strictEqual(scope.get(), undefined);
  });
});

// ---------------------------------------------------------------------------
// Flavor B — ManagedContext class
// ---------------------------------------------------------------------------

class SessionContext extends ManagedContext<FakeSession> {
  readonly events: string[] = [];

  open(): FakeSession {
    this.events.push("open");
    return makeSession();
  }

  close(_: FakeSession, error?: unknown): void {
    this.events.push(error !== undefined ? "close:error" : "close:ok");
  }
}

describe("ManagedContext — class flavor", () => {
  it("calls open() then close() on success", async () => {
    _resetContextManager();
    const ctx = new SessionContext();
    await ctx.use(async () => {});
    assert.deepStrictEqual(ctx.events, ["open", "close:ok"]);
  });

  it("calls open() then close() with error when fn throws, re-throws", async () => {
    _resetContextManager();
    const ctx = new SessionContext();
    await assert.rejects(() =>
      ctx.use(async () => {
        throw new Error("fail");
      }),
    );
    assert.deepStrictEqual(ctx.events, ["open", "close:error"]);
  });

  it(".get() returns the value inside use(), undefined outside", async () => {
    _resetContextManager();
    const ctx = new SessionContext();

    assert.strictEqual(ctx.get(), undefined);
    await ctx.use(async (s) => {
      assert.ok(ctx.get());
      assert.strictEqual(ctx.get(), s);
    });
    assert.strictEqual(ctx.get(), undefined);
  });

  it("shared key — value also readable via getContext(key)", async () => {
    _resetContextManager();

    const MY_KEY = createContextKey<FakeSession>("test.class.shared");

    class SharedSessionContext extends ManagedContext<FakeSession> {
      readonly key = MY_KEY;
      open() {
        return makeSession();
      }
      close() {}
    }

    const ctx = new SharedSessionContext();
    await ctx.use(async () => {
      assert.ok(ctx.get());
      assert.strictEqual(ctx.get(), getContext(MY_KEY));
    });
    assert.strictEqual(getContext(MY_KEY), undefined);
  });

  it("inject decorator — open/close lifecycle and .get() inside method", async () => {
    _resetContextManager();
    const ctx = new SessionContext();

    class Repo {
      async query() {
        assert.ok(ctx.get(), "session must be reachable via .get()");
      }
    }
    const descriptor = Object.getOwnPropertyDescriptor(Repo.prototype, "query")!;
    ctx.inject(Repo.prototype, "query", descriptor);
    Object.defineProperty(Repo.prototype, "query", descriptor);

    await new Repo().query();
    assert.deepStrictEqual(ctx.events, ["open", "close:ok"]);
    assert.strictEqual(ctx.get(), undefined);
  });
});
