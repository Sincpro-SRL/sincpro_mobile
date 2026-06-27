import { _getContextManager, getContext } from "./context_api";
import type { ContextKey } from "./context_key";
import { createContextKey } from "./context_key";

/**
 * Contract exposed by both managed context flavors.
 *
 * Acquire the resource, run a block with it in context, then release —
 * all guaranteed even on error.
 */
export interface ContextScope<T> {
  /**
   * Reads the current value from the active context.
   * Returns `undefined` when called outside an active `use()` block.
   *
   * @example
   * await dbSession.use(async () => {
   *   const session = dbSession.get(); // defined here
   * });
   * dbSession.get(); // undefined — outside the block
   */
  get(): T | undefined;

  /**
   * Acquires the resource, pushes it into context, calls `fn`, then releases.
   * The resource is available via `.get()` (or the `fn` argument) throughout
   * the call, including any nested async code on the same stack.
   *
   * @example
   * await dbSession.use(async (session) => {
   *   await session.insert(order);
   * });
   */
  use<R>(fn: (value: T) => R | Promise<R>): Promise<R>;

  /**
   * Method decorator. Wraps the decorated method in a `use()` call.
   * The resource is acquired before the method runs and released after.
   * Read the value inside the method via `.get()`.
   *
   * @example
   * class OrderRepository {
   *   \@dbSession.inject
   *   async save(order: Order) {
   *     const session = dbSession.get()!;
   *     await session.insert(order);
   *   }
   * }
   */
  inject: MethodDecorator;
}

function buildScope<T>(
  acquire: () => T | Promise<T>,
  release: (value: T, error?: unknown) => void | Promise<void>,
  sharedKey?: ContextKey<T>,
): ContextScope<T> {
  const key = sharedKey ?? createContextKey<T>("sincpro.managed");

  async function run<R>(fn: (value: T) => R | Promise<R>): Promise<R> {
    const value = await acquire();
    const manager = _getContextManager();
    manager.push(manager.active().set(key, value));

    let thrownError: unknown;
    try {
      return await fn(value);
    } catch (e) {
      thrownError = e;
      throw e;
    } finally {
      manager.pop();
      await release(value, thrownError);
    }
  }

  const inject: MethodDecorator = function (_target, _key, descriptor: PropertyDescriptor) {
    const original = descriptor.value as (this: unknown, ...args: unknown[]) => unknown;
    descriptor.value = function (this: unknown, ...args: unknown[]) {
      return run(() => original.apply(this, args) as never);
    };
    return descriptor;
  };

  return { get: () => getContext(key), use: run, inject };
}

/**
 * Generator flavor — define the full lifecycle in one block.
 *
 * Code before `yield` runs on enter; code after `yield` (or inside `catch`)
 * runs on exit. The yielded value is the resource placed into context — it
 * must be an object (a primitive cannot carry the lifecycle and throws).
 *
 * An optional `key` can be provided to also store the value under that key,
 * making it readable via `ContextManager.get(key)` from anywhere on the stack.
 * Without a key, use `.get()` on the scope itself.
 *
 * @example
 * // Auto key — read via scope.get()
 * const dbSession = ContextManager.managed(async function* () {
 *   const session = await db.openSession();
 *   try {
 *     yield session;
 *     await session.commit();
 *   } catch (e) {
 *     await session.rollback();
 *     throw e;
 *   }
 * });
 * await dbSession.use(async () => {
 *   const session = dbSession.get()!;
 * });
 *
 * @example
 * // Shared key — readable via ContextManager.get(SESSION_KEY) from nested code
 * const SESSION_KEY = ContextManager.createKey<DbSession>("db.session");
 * const dbSession = ContextManager.managed(async function* () {
 *   yield await db.openSession();
 * }, SESSION_KEY);
 * await dbSession.use(async () => {
 *   const session = ContextManager.get(SESSION_KEY)!;
 * });
 */
const GEN_SYM = Symbol("sincpro.managed.gen");

export function managed<T>(
  factory: () => AsyncGenerator<T, void, unknown>,
  key?: ContextKey<T>,
): ContextScope<T> {
  return buildScope<T>(
    async () => {
      const gen = factory();
      const { value, done } = await gen.next();
      if (done) throw new Error("managed: generator did not yield a value");
      // The generator is stamped onto the yielded value so `release` can resume it.
      // A primitive cannot carry the stamp, which would silently break the
      // commit/rollback lifecycle — fail fast instead.
      if (value === null || (typeof value !== "object" && typeof value !== "function")) {
        await gen
          .throw(new Error("managed: yielded value must be an object"))
          .catch(() => {});
        throw new Error("managed: generator must yield an object (got a primitive)");
      }
      (value as unknown as Record<symbol, unknown>)[GEN_SYM] = gen;
      return value as T;
    },
    async (value, error) => {
      const gen = (value as unknown as Record<symbol, unknown>)[GEN_SYM] as
        | AsyncGenerator<T, void, unknown>
        | undefined;
      if (!gen) return;
      if (error !== undefined) {
        await gen.throw(error).catch(() => {});
      } else {
        await gen.next();
      }
    },
    key,
  );
}

/**
 * Class flavor — extend and implement `open()` and `close()`.
 *
 * Gives explicit method signatures and IDE completion on each lifecycle hook.
 * The key is managed internally; read the value via `.get()` anywhere in the
 * active stack.
 *
 * Optionally declare a `readonly key` to share the value under a known key,
 * making it readable via `ContextManager.get(key)` from nested code.
 *
 * @example
 * // Auto key — read via instance.get()
 * class DbSessionContext extends ContextManager.ManagedContext<DbSession> {
 *   open()                 { return db.openSession(); }
 *   close(session, error?) { return error ? session.rollback() : session.commit(); }
 * }
 * const dbSession = new DbSessionContext();
 * await dbSession.use(async () => {
 *   const session = dbSession.get()!;
 * });
 *
 * @example
 * // Shared key — readable via ContextManager.get(SESSION_KEY) from nested code
 * const SESSION_KEY = ContextManager.createKey<DbSession>("db.session");
 * class DbSessionContext extends ContextManager.ManagedContext<DbSession> {
 *   readonly key = SESSION_KEY;
 *   open()                 { return db.openSession(); }
 *   close(session, error?) { return error ? session.rollback() : session.commit(); }
 * }
 */
export abstract class ManagedContext<T> implements ContextScope<T> {
  readonly key?: ContextKey<T>;

  private _scope: ContextScope<T> | undefined;

  // Lazy — subclass key field is set before first call, not at parent field init time
  private _getScope(): ContextScope<T> {
    return (this._scope ??= buildScope(
      () => this.open(),
      (v, e) => this.close(v, e),
      this.key,
    ));
  }

  abstract open(): T | Promise<T>;
  abstract close(value: T, error?: unknown): void | Promise<void>;

  get(): T | undefined {
    return this._getScope().get();
  }

  use<R>(fn: (value: T) => R | Promise<R>): Promise<R> {
    return this._getScope().use(fn);
  }

  get inject(): MethodDecorator {
    return this._getScope().inject;
  }
}
