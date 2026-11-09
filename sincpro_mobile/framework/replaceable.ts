/** A core component the app can swap for a subclass without modifying the core. */
export interface Replaceable<T extends object> {
  /** Always delegates to the current implementation: every caller of the core sees a swap. */
  readonly instance: T;
  /** Swaps the implementation, e.g. `set(new MyPrinter())` at module scope, before the AppShell. */
  set(next: T): void;
  current(): T;
}

/**
 * Wraps a core component so an app can extend it by inheritance:
 * `class MyPrinter extends PrinterService` and then `setPrinterService(new MyPrinter())`.
 */
export function replaceable<T extends object>(initial: T): Replaceable<T> {
  let current = initial;
  const instance = new Proxy({} as T, {
    get: (_target, property) => {
      const value = Reflect.get(current, property, current);
      return typeof value === "function" ? value.bind(current) : value;
    },
    set: (_target, property, value) => Reflect.set(current, property, value, current),
    has: (_target, property) => property in current,
  });
  return {
    instance,
    set: (next) => {
      current = next;
    },
    current: () => current,
  };
}
