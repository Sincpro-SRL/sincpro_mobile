import { Context } from "../context.ts";
import { getActiveContext, runWithContext } from "../context_api.ts";
import type { ContextKey } from "../context_key.ts";

/**
 * Method decorator. Before calling the method, applies transform to the
 * active context and runs the method within the resulting context.
 *
 * Useful when a method needs to enrich the context with values available
 * on the instance (e.g. the current BLE device, the active session ID).
 *
 * transform receives the current active context and must return the new one.
 * The instance (this) is passed as second argument so instance properties
 * are accessible without closure hacks.
 *
 * @example
 * class BleOrchestrator {
 *   private activeDevice: BleDevice;
 *
 *   @WithContext((ctx, self) =>
 *     ctx.set(DEVICE_KEY, (self as BleOrchestrator).activeDevice)
 *   )
 *   async startSession() {
 *     // DEVICE_KEY is now in context for every nested call
 *   }
 * }
 */
export function WithContext(
  transform: (ctx: Context, self: unknown) => Context,
): MethodDecorator {
  return function (_target, _key, descriptor: PropertyDescriptor) {
    const original = descriptor.value as (this: unknown, ...args: unknown[]) => unknown;

    descriptor.value = function (this: unknown, ...args: unknown[]): unknown {
      const ctx = transform(getActiveContext(), this);
      return runWithContext(ctx, () => original.apply(this, args));
    };

    return descriptor;
  };
}

/**
 * Shorthand for setting a single key before a method runs.
 *
 * @example
 * @SetContext(TENANT_KEY, "clinic-001")
 * async handleRequest() { ... }
 */
export function SetContext<T>(key: ContextKey<T>, value: T): MethodDecorator {
  return WithContext((ctx) => ctx.set(key, value));
}
