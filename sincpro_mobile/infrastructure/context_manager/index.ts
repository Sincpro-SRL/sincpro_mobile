// Main entry point — public facade for framework consumers
export { ContextManager } from "./context_manager_facade";

// Public API — safe for framework consumers
export { Context } from "./context";
export { getActiveContext, getContext, runWithContext } from "./context_api";
export type { ContextKey } from "./context_key";
export { createContextKey } from "./context_key";
export { PropagateContext } from "./decorators/propagate_context";
export { SetContext, WithContext } from "./decorators/with_context";
export type { ContextScope } from "./managed_context";
export { managed, ManagedContext } from "./managed_context";

// Internal API — for framework adapters and tests only, not for app consumers
export { _getContextManager, _resetContextManager } from "./context_api";
export { StackContextManager } from "./stack_context_manager";
