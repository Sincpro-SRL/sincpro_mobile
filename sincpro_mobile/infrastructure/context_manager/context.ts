import type { ContextKey } from "./context_key";

/**
 * Immutable execution-scoped key-value store.
 *
 * Every modification returns a new Context — the original is never mutated.
 * This makes it safe to pass across async boundaries without defensive copies.
 */
export class Context {
  private readonly _map: Map<symbol, unknown>;

  private constructor(map: Map<symbol, unknown>) {
    this._map = map;
  }

  static readonly ROOT: Context = new Context(new Map());

  get<T>(key: ContextKey<T>): T | undefined {
    return this._map.get(key._symbol) as T | undefined;
  }

  set<T>(key: ContextKey<T>, value: T): Context {
    const next = new Map(this._map);
    next.set(key._symbol, value);
    return new Context(next);
  }

  delete<T>(key: ContextKey<T>): Context {
    const next = new Map(this._map);
    next.delete(key._symbol);
    return new Context(next);
  }

  describe(): string {
    const parts: string[] = [];
    for (const [sym, val] of this._map) {
      const name = sym.description ?? "unknown";
      const repr =
        val !== null && typeof val === "object"
          ? (val.constructor?.name ?? "Object")
          : String(val);
      parts.push(`${name}: ${repr}`);
    }
    return `Context { ${parts.join(", ") || "empty"} }`;
  }
}
