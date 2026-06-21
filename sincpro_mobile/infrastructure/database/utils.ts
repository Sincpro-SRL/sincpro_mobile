import { convertToArray } from "@sincpro/mobile/tools/utils/collections";
import * as Crypto from "expo-crypto";
import { v7 as uuidv7 } from "uuid";

/**
 * Constructs a SQL placeholder string and corresponding values for use in a query based on the provided field and data.
 *
 * @param {string} field - The database field name to be used in the placeholder condition.
 * @param {any} data - The data used to generate placeholders and corresponding values. Can be an array, object, set, or a single value.
 * @return {[string, string]} - A tuple where the first element is the formatted placeholder condition string,
 * and the second element is the corresponding values. IE: `["field IN (?, ?, ?)", [value1, value2, value3]]`.
 */
export function getPlaceholders(field: string, data: any | any[]): [string, string] {
  let placeholders = "";
  let values = data;
  if (data instanceof Set) {
    values = convertToArray(data);
    placeholders = values.map(() => "?").join(",");
  } else if (data instanceof Object) {
    values = Object.values(data);
    placeholders = Object.keys(data)
      .map(() => "?")
      .join(",");
  } else {
    values = convertToArray(data);
    placeholders = data.map(() => "?").join(",");
  }
  return [`${field} IN (${placeholders})`, values];
}

export function generateUUID(): string {
  return uuidv7({
    random: Crypto.getRandomBytes(16),
  });
}
