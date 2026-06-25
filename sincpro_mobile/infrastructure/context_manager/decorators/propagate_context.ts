import { getActiveContext, runWithContext } from "../context_api.ts";

type AnyClass = new (...args: never[]) => object;

const PROPAGATED = Symbol("sincpro.context.propagated");

/**
 * Class decorator. Captures the active context at the moment each method is
 * called and ensures the method body runs within that context.
 *
 * Useful for classes whose methods may be invoked from callbacks, event
 * handlers, or fire-and-forget patterns where the caller's context would
 * otherwise be lost by the time the method executes.
 *
 * For the common sequential-await pattern, context propagates automatically
 * via the stack — @PropagateContext adds value mainly when methods are called
 * outside of a runWithContext block or after a timer/event boundary.
 *
 * @example
 * @PropagateContext
 * class BleNotificationService {
 *   onHeartRateReading(value: number) {
 *     // context active when the listener was registered is visible here
 *     const device = getContext(DEVICE_KEY);
 *   }
 * }
 */
export function PropagateContext<T extends AnyClass>(target: T): T {
  if ((target as Record<symbol, unknown>)[PROPAGATED]) {
    throw new Error(`PropagateContext: ${target.name} is already decorated`);
  }

  const prototype = target.prototype as Record<string, unknown>;

  for (const key of Object.getOwnPropertyNames(prototype)) {
    if (key === "constructor") continue;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
    if (!descriptor || typeof descriptor.value !== "function") continue;

    const original = descriptor.value as (this: unknown, ...args: unknown[]) => unknown;

    descriptor.value = function (this: unknown, ...args: unknown[]): unknown {
      const ctx = getActiveContext();
      const result = runWithContext(ctx, () => original.apply(this, args));

      if (result instanceof Promise) {
        // Context was captured at call time (above). The Promise itself
        // resolves outside the runWithContext scope — that is expected for
        // the stack-based manager. Sequential awaits inside the method body
        // already saw the correct context when they were initiated.
        return result;
      }

      return result;
    };

    Object.defineProperty(prototype, key, descriptor);
  }

  Object.defineProperty(target, PROPAGATED, { value: true, enumerable: false });
  return target;
}
