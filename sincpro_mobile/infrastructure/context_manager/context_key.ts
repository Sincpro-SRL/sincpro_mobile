/**
 * Opaque typed key for storing values in a Context.
 *
 * Two calls to createContextKey with the same description produce different
 * keys — collision between modules is impossible even if they share names.
 *
 * _type_marker is a phantom field: it only exists in the TypeScript type
 * system to carry T through inference. It is never assigned at runtime.
 */
export type ContextKey<T> = {
  readonly description: string;
  readonly _symbol: symbol;
  readonly _type_marker: T;
};

export function createContextKey<T>(description: string): ContextKey<T> {
  return { description, _symbol: Symbol(description) } as ContextKey<T>;
}
