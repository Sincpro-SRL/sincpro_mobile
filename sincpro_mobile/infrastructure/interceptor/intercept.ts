export interface MethodCall {
  className: string;
  methodName: string;
  args: unknown[];
}

export interface InterceptorHooks {
  before?: (call: MethodCall) => void;
  after?: (call: MethodCall, result: unknown) => void;
  onError?: (call: MethodCall, error: unknown) => void;
}

type AnyFn = (...args: unknown[]) => unknown;

function isPlainFunction(descriptor: PropertyDescriptor | undefined): boolean {
  if (!descriptor) return false;
  if (typeof descriptor.value !== "function") return false;
  if (descriptor.get || descriptor.set) return false;
  return true;
}

function wrap(
  original: AnyFn,
  className: string,
  methodName: string,
  hooks: InterceptorHooks,
) {
  return function wrapped(this: unknown, ...args: unknown[]): unknown {
    const call: MethodCall = { className, methodName, args };
    hooks.before?.(call);

    try {
      const result = original.apply(this, args);

      if (result instanceof Promise) {
        return result.then(
          (value) => {
            hooks.after?.(call, value);
            return value;
          },
          (error) => {
            hooks.onError?.(call, error);
            throw error;
          },
        );
      }

      hooks.after?.(call, result);
      return result;
    } catch (error) {
      hooks.onError?.(call, error);
      throw error;
    }
  };
}

const INTERCEPTED = Symbol("sincpro.intercepted");

function ownMethodNames(prototype: object): string[] {
  return Object.getOwnPropertyNames(prototype).filter((name) => name !== "constructor");
}

/**
 * Mutates the class prototype so every instance is automatically traced.
 * Use when the class is instantiated multiple times, or as the implementation
 * behind a class decorator.
 *
 * ```ts
 * interceptClass(CustomerService, otelHooks());
 * // all CustomerService instances are now traced
 *
 * // as a decorator:
 * function Traced(hooks: InterceptorHooks) {
 *   return <T extends new (...args: never[]) => object>(target: T) =>
 *     interceptClass(target, hooks);
 * }
 * @Traced(otelHooks())
 * class OrderService { ... }
 * ```
 *
 * Throws if called twice on the same class — hooks stack silently otherwise.
 * Getters, setters, and the constructor are never wrapped.
 */
export function interceptClass<T extends new (...args: never[]) => object>(
  target: T,
  hooks: InterceptorHooks,
): T {
  if ((target as Record<symbol, unknown>)[INTERCEPTED]) {
    throw new Error(`interceptClass: ${target.name} is already intercepted`);
  }

  const prototype = target.prototype as object;

  for (const methodName of ownMethodNames(prototype)) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
    if (!isPlainFunction(descriptor)) continue;

    const original = descriptor!.value as AnyFn;
    descriptor!.value = wrap(original, target.name, methodName, hooks);
    Object.defineProperty(prototype, methodName, descriptor!);
  }

  Object.defineProperty(target, INTERCEPTED, { value: true, enumerable: false });
  return target;
}

/**
 * Wraps a standalone function. Use for module-level functions or factory outputs.
 *
 * ```ts
 * export const fetchOrders = interceptFunction(rawFetchOrders, otelHooks());
 * ```
 *
 * `MethodCall.className` is empty for standalone functions; `methodName` is the
 * function's `.name` (or `"anonymous"` if unnamed).
 */
export function interceptFunction<T extends (...args: never[]) => unknown>(
  fn: T,
  hooks: InterceptorHooks,
): T {
  return wrap(fn as unknown as AnyFn, "", fn.name || "anonymous", hooks) as unknown as T;
}

/**
 * Wraps a single live instance via Proxy without touching the class prototype.
 * Use for singletons exported directly (e.g. `dbCursor`, `distributionWorkflows`).
 *
 * ```ts
 * export const dbCursor = interceptInstance(new DBCursor(), otelHooks());
 * // only this exported instance is traced; other DBCursor instances are unaffected
 * ```
 *
 * Hooks contract: `before` fires before the call; `after` fires on success with
 * the resolved value; `onError` fires on throw or rejection — the error is always
 * re-thrown after `onError` completes.
 */
export function interceptInstance<T extends object>(instance: T, hooks: InterceptorHooks): T {
  const className = instance.constructor?.name ?? "Object";

  return new Proxy(instance, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function" || typeof prop === "symbol") {
        return value;
      }
      return wrap(value as AnyFn, className, prop, hooks).bind(target);
    },
  });
}
