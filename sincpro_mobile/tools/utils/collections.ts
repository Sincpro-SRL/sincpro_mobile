/**
 * Converts the input value into an array. If the value is already an array, it is returned as is.
 * If the value is a Set, it is converted to an array. Otherwise, the value is wrapped in an array.
 *
 * @param value The value to convert. It can be a single item, an array, a Set, or undefined.
 * @returns     An array containing the input value(s). If the input is undefined or null, an empty array is returned.
 *
 * @example
 * // Single value: wrapped in an array
 * const single = convertToArray(42);
 * // single: [42]
 *
 * @example
 * // Already an array: returned as-is
 * const fromArray = convertToArray(['a', 'b', 'c']);
 * // fromArray: ['a', 'b', 'c']
 *
 * @example
 * // From a Set: converted to array
 * const mySet = new Set<number>([1, 2, 3]);
 * const fromSet = convertToArray(mySet);
 * // fromSet: [1, 2, 3]
 */
export function convertToArray<T>(value: T | T[] | Set<T> | undefined): T[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (value instanceof Set) {
    return Array.from(value);
  }
  if (!Array.isArray(value)) {
    return [value];
  }
  return value;
}

type PropertyKey = string | number | symbol;
type KeySelector<T, K extends PropertyKey> = keyof T | ((item: T) => K);

/**
 * Groups an array of items by a given property or key-selector function.
 *
 * @param array    The array of items to group.
 * @param selector Either the name of a property on T, or a function that returns the key.
 * @returns        A record where each key maps to an array of items sharing that key.
 *
 * @example
 * interface Product { id: number; name: string; category: string; }
 * const products: Product[] = [
 *   { id: 1, name: 'Milk',   category: 'dairy' },
 *   { id: 2, name: 'Cheese', category: 'dairy' },
 *   { id: 3, name: 'Apple',  category: 'fruit' },
 * ];
 *
 * // Group by property:
 * const byCategory = groupBy(products, 'category');
 * // { dairy: [ {…}, {…} ], fruit: [ {…} ] }
 *
 * // Group by function:
 * const byFirstLetter = groupBy(products, p => p.name[0]);
 * // { M: [ {…} ], C: [ {…} ], A: [ {…} ] }
 */
export function groupBy<T, K extends PropertyKey>(
  array: T[],
  selector: KeySelector<T, K>,
): Record<K, T[]> {
  const getKey: (item: T) => K =
    typeof selector === "function"
      ? (selector as (item: T) => K)
      : (item: T) => item[selector as keyof T] as unknown as K;

  return array.reduce<Record<K, T[]>>(
    (groups, item) => {
      const key = getKey(item);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
      return groups;
    },
    {} as Record<K, T[]>,
  );
}

/**
 * Creates a lookup object where each key maps to the last item in the array
 * that corresponds to that key. If multiple items share the same key,
 * the last one wins.
 *
 * @param array     – The array of items to index.
 * @param selector  – A property name of T, or a function that returns the key.
 * @returns         A record where each key maps to a single item.
 *
 * @example
 * interface User { id: number; name: string; }
 * const users: User[] = [
 *   { id: 1, name: 'Alice' },
 *   { id: 2, name: 'Bob' },
 *   { id: 1, name: 'Alicia' },
 * ];
 *
 * // Index by property:
 * const byId = keyBy(users, 'id');
 * // byId === {
 * //   1: { id: 1, name: 'Alicia' }, // last one wins
 * //   2: { id: 2, name: 'Bob' }
 * // }
 *
 * @example
 * // Index by function:
 * const byInitial = keyBy(users, u => u.name[0]);
 * // byInitial === {
 * //   A: { id: 1, name: 'Alicia' },
 * //   B: { id: 2, name: 'Bob' }
 * // }
 */
export function keyBy<T, K extends PropertyKey>(
  array: T[],
  selector: KeySelector<T, K>,
): Record<K, T> {
  const getKey: (item: T) => K =
    typeof selector === "function"
      ? (selector as (item: T) => K)
      : (item: T) => item[selector as keyof T] as unknown as K;

  return array.reduce<Record<K, T>>(
    (map, item) => {
      const key = getKey(item);
      map[key] = item;
      return map;
    },
    {} as Record<K, T>,
  );
}

/**
 * Creates a lookup Map where each key maps to the last value
 * produced by `valueSelector` for items in the array.
 * If multiple items share the same key, the last one wins.
 *
 * @param array          – The array of items to index.
 * @param keySelector    – A property name of T, or a function that returns the key.
 * @param valueSelector  – A function that returns the value to store for each key.
 * @returns              A Map where each key maps to a single value.
 *
 * @example
 * interface User { id: number; name: string; }
 * const users: User[] = [
 *   { id: 1, name: 'Alice' },
 *   { id: 2, name: 'Bob' },
 *   { id: 1, name: 'Alicia' },
 * ];
 *
 * // Map by property, valueSelector returns the user’s name:
 * const nameMap = toMap(users, 'id', u => u.name);
 * // nameMap.get(1) === 'Alicia'   // last one wins
 * // nameMap.get(2) === 'Bob'
 *
 * @example
 * interface MoveLine { id: number; product_id: number; quantity: number; }
 * const moves: MoveLine[] = [
 *   { id: 17, product_id: 842, quantity: 42 },
 *   { id: 18, product_id: 838, quantity: 45 },
 * ];
 *
 * // Map product_id → quantity:
 * const qtyMap = toMap(moves, m => m.product_id, m => m.quantity);
 * // qtyMap.get(842) === 42
 * // qtyMap.get(838) === 45
 */
export function toMap<T, K extends PropertyKey, V>(
  array: T[],
  keySelector: KeySelector<T, K>,
  valueSelector: (item: T) => V,
): Map<K, V> {
  const getKey = (item: T): K =>
    typeof keySelector === "function"
      ? (keySelector as (item: T) => K)(item)
      : (item[keySelector as keyof T] as unknown as K);

  const map = new Map<K, V>();
  for (const item of array) {
    map.set(getKey(item), valueSelector(item));
  }
  return map;
}
