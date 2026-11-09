/**
 * A subscriber class that answers instead of another declares it, like `replaces=` in
 * sincpro_framework: `static replaces = PrintImageSubscriber`. The replaced one does not run.
 */
export interface Replacing {
  replaces?: unknown;
}

/** Drops every item whose class another item replaces, across all modules. */
export function withoutReplaced<T extends object>(
  byModule: Record<string, T[]>,
): Record<string, T[]> {
  const replaced = new Set(
    Object.values(byModule)
      .flat()
      .map((item) => (item.constructor as Replacing).replaces)
      .filter(Boolean),
  );
  if (replaced.size === 0) return byModule;
  const result: Record<string, T[]> = {};
  for (const [key, items] of Object.entries(byModule)) {
    result[key] = items.filter((item) => !replaced.has(item.constructor));
  }
  return result;
}
