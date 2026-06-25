import { Context } from "./context.ts";
import type { ContextKey } from "./context_key.ts";
import { StackContextManager } from "./stack_context_manager.ts";

const _manager = new StackContextManager();

/** Returns the context active in the current execution scope. */
export function getActiveContext(): Context {
  return _manager.active();
}

/**
 * Reads a value from the active context.
 * Equivalent to getActiveContext().get(key).
 */
export function getContext<T>(key: ContextKey<T>): T | undefined {
  return _manager.active().get(key);
}

/**
 * Runs fn within ctx as the active context.
 *
 * For async functions, ctx stays active until the returned Promise resolves or
 * rejects — not just until the first await. This means nested calls at any
 * point in the async chain see the correct context.
 *
 * For sync functions, ctx is active for the duration of the call.
 */
export function runWithContext<T>(ctx: Context, fn: () => T): T {
  _manager.push(ctx);
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(
        (v) => {
          _manager.pop();
          return v;
        },
        (e) => {
          _manager.pop();
          throw e;
        },
      ) as T;
    }
    _manager.pop();
    return result;
  } catch (e) {
    _manager.pop();
    throw e;
  }
}

/**
 * Returns the underlying manager.
 * Used by interceptor hooks (push/pop) and by adapters (e.g. OTel bridge).
 * @internal
 */
export function _getContextManager(): StackContextManager {
  return _manager;
}

/** @internal — test use only */
export function _resetContextManager(): void {
  _manager.reset();
}
