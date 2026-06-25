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
 * For sequential async flows, ctx is visible to all awaited calls inside fn.
 */
export function runWithContext<T>(ctx: Context, fn: () => T): T {
  return _manager.with(ctx, fn);
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
