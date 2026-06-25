// Main entry point — public facade for framework consumers
export { ContextManager } from "./context_manager_facade.ts";

// Public API — safe for framework consumers
export { Context } from "./context.ts";
export { getActiveContext, getContext, runWithContext } from "./context_api.ts";
export type { ContextKey } from "./context_key.ts";
export { createContextKey } from "./context_key.ts";
export { PropagateContext } from "./decorators/propagate_context.ts";
export { SetContext, WithContext } from "./decorators/with_context.ts";
export type { ContextScope } from "./managed_context.ts";
export { managed, ManagedContext } from "./managed_context.ts";

// Internal API — for framework adapters and tests only, not for app consumers
export { _getContextManager, _resetContextManager } from "./context_api.ts";
export { StackContextManager } from "./stack_context_manager.ts";
