import * as Crypto from "expo-crypto";

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;

interface JsonObject {
  [key: string]: JsonValue;
}

type JsonArray = JsonValue[];

/**
 * Adapter for generating canonical JSON and SHA-256 hashes
 * in a deep, deterministic manner without external dependencies.
 */
export const JsonSerializerAdapter = {
  /**
   * Normalize special types (Date, etc.) into JSON-friendly structures.
   */
  cleanData<T extends JsonValue>(data: T): JsonValue {
    const replacer = (_key: string, value: any) =>
      value instanceof Date ? value.toISOString() : value;
    return JSON.parse(JSON.stringify(data, replacer));
  },

  /**
   * Recursively sort object keys and serialize without extra whitespace.
   */
  canonicalize(value: JsonValue): string {
    if (value === null || typeof value !== "object") {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map((v) => this.canonicalize(v)).join(",")}]`;
    }
    const obj = value as JsonObject;
    return (
      "{" +
      Object.keys(obj)
        .sort()
        .filter((k) => obj[k] !== undefined)
        .map((k) => `${JSON.stringify(k)}:${this.canonicalize(obj[k]!)}`)
        .join(",") +
      "}"
    );
  },

  /**
   * Convert a RoutePlan object to its canonical JSON string.
   */
  convertToCanonicalJson(jsObj: any): string {
    const clean = this.cleanData(jsObj) as JsonObject;
    return this.canonicalize(clean);
  },

  /**
   * Compute the SHA-256 hash of the canonical JSON.
   */
  async calculateHash(jsObj: any): Promise<string> {
    const canonical = this.convertToCanonicalJson(jsObj);
    return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonical);
  },
};
