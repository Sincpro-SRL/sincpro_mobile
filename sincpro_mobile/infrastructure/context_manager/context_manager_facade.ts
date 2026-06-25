import { Context } from "./context.ts";
import { getActiveContext, getContext, runWithContext } from "./context_api.ts";
import type { ContextKey } from "./context_key.ts";
import { createContextKey } from "./context_key.ts";
import { PropagateContext } from "./decorators/propagate_context.ts";
import { SetContext, WithContext } from "./decorators/with_context.ts";
import { managed, ManagedContext } from "./managed_context.ts";

export function run<T>(
  transform: (ctx: Context) => Context,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  const ctx = transform(getActiveContext());
  return runWithContext(ctx, fn);
}

export const ContextManager = {
  /**
   * Creates a typed key for storing values in the context.
   * Each call produces a unique key — define it as a module-level constant.
   * @example
   * const TENANT_KEY = ContextManager.createKey<string>("tenant");
   */
  createKey: createContextKey,

  /**
   * Reads the value for a key from the active context.
   * Returns undefined if the key was not set in the current stack.
   */
  get<T>(key: ContextKey<T>): T | undefined {
    return getContext(key);
  },

  /**
   * Returns the full active Context (immutable snapshot).
   */
  active(): Context {
    return getActiveContext();
  },

  /**
   * Runs fn within a transformed context.
   * The original context is restored automatically on exit, even on error.
   * @example
   * await ContextManager.run(
   *   (ctx) => ctx.set(TENANT_KEY, "acme").set(USER_KEY, user),
   *   async () => processOrder(order),
   * );
   */
  run,

  /**
   * Class decorator. Captures the active context at each method call site and
   * ensures the method body runs within it. Useful for callbacks, event handlers,
   * or any pattern where the method is invoked outside the original call stack.
   * @example
   * \@ContextManager.Propagate
   * class BleNotificationHandler { ... }
   */
  Propagate: PropagateContext,

  /**
   * Method decorator. Enriches the active context before the method runs.
   * Receives the current context and the instance (`self`), returns the new context.
   * @example
   * class BleOrchestrator {
   *   \@ContextManager.Enrich((ctx, self) =>
   *     ctx.set(DEVICE_KEY, (self as BleOrchestrator).activeDevice)
   *   )
   *   async startSession() { ... }
   * }
   */
  Enrich: WithContext,

  /**
   * Shorthand for setting a single key before a method runs.
   * @example
   * \@ContextManager.Set(TENANT_KEY, "clinic-001")
   * async handleRequest() { ... }
   */
  Set: SetContext,

  /**
   * Generator flavor — define acquire and release in one block, `yield` is the hand-off.
   *
   * Code before `yield` runs on enter; code after (or inside `catch`) runs on exit.
   * Pass an optional `key` to also store the value under that key so nested
   * code can read it via `ContextManager.get(key)`. Without a key, use `.get()`.
   *
   * @example
   * // Auto key
   * const dbSession = ContextManager.managed(async function* () {
   *   const session = await db.openSession();
   *   try { yield session; await session.commit(); }
   *   catch (e) { await session.rollback(); throw e; }
   * });
   * await dbSession.use(async () => { const s = dbSession.get()!; });
   *
   * @example
   * // Shared key
   * const SESSION_KEY = ContextManager.createKey<DbSession>("db.session");
   * const dbSession = ContextManager.managed(async function* () {
   *   yield await db.openSession();
   * }, SESSION_KEY);
   * await dbSession.use(async () => { const s = ContextManager.get(SESSION_KEY)!; });
   */
  managed,

  /**
   * Class flavor — extend and implement `open()` and `close()`.
   *
   * Familiar OOP shape; gives explicit types and IDE completion on each hook.
   * The key is managed internally — read the value via `.get()`.
   *
   * @example
   * class DbSessionContext extends ContextManager.ManagedContext<DbSession> {
   *   open()                 { return db.openSession(); }
   *   close(session, error?) { return error ? session.rollback() : session.commit(); }
   * }
   *
   * const dbSession = new DbSessionContext();
   * await dbSession.use(async () => {
   *   const session = dbSession.get()!;
   *   await session.insert(order);
   * });
   */
  ManagedContext,
} as const;
