import { Context } from "./context.ts";

/**
 * Hermes-compatible context manager.
 *
 * Hermes (React Native JS engine) has no AsyncLocalStorage and no native
 * Promise hooks, so automatic async context propagation is not possible.
 * This manager uses an explicit stack instead:
 *
 * - with(ctx, fn)   — pushes ctx, calls fn synchronously, pops on return.
 *                     Works correctly for synchronous code and for sequential
 *                     await chains (where each await resolves before the next
 *                     call starts).
 *
 * - push(ctx) / pop() — manual variant used by before/after interceptor hooks
 *                     so the context stays active across async boundaries
 *                     (the push in before() and the pop in after() bracket the
 *                     entire async method execution, not just the sync part).
 *
 * Known limitation: concurrent branches (Promise.all with independent contexts)
 * share the top of stack. For mobile single-user sequential flows this is
 * acceptable — document it, never hide it.
 */
export class StackContextManager {
  private _stack: Context[] = [Context.ROOT];

  active(): Context {
    return this._stack[this._stack.length - 1] ?? Context.ROOT;
  }

  with<T>(ctx: Context, fn: () => T): T {
    this._stack.push(ctx);
    try {
      return fn();
    } finally {
      this._stack.pop();
    }
  }

  /**
   * Push a context explicitly. Must be paired with pop().
   * Use when you need the context to survive past a synchronous return,
   * i.e. inside before/after interceptor hooks for async methods.
   */
  push(ctx: Context): void {
    this._stack.push(ctx);
  }

  /**
   * Pop the top context. Never pops the root — safe to call on empty stacks.
   */
  pop(): void {
    if (this._stack.length > 1) this._stack.pop();
  }

  /** @internal — test and framework init use only */
  reset(): void {
    this._stack = [Context.ROOT];
  }
}
