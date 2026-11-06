import { readValues, valuesOf } from "@sincpro/client-framework";

function publishable(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  if (
    value instanceof Uint8Array ||
    value instanceof ArrayBuffer ||
    value instanceof DataView ||
    typeof (value as { toJSON?: unknown }).toJSON === "function"
  ) {
    return value;
  }
  seen.add(value);
  try {
    if (value instanceof Map) {
      return new Map([...value].map(([key, item]) => [key, publishable(item, seen)]));
    }
    if (value instanceof Set) {
      return new Set([...value].map((item) => publishable(item, seen)));
    }
    if (Array.isArray(value)) return value.map((item) => publishable(item, seen));
    const published: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (key.startsWith("_") || typeof item === "function") continue;
      published[key] = publishable(item, seen);
    }
    return published;
  } finally {
    seen.delete(value);
  }
}

export function safeJsonStringify(obj: unknown, pretty: boolean = false): string {
  const wire = valuesOf(publishable(obj, new WeakSet()));
  return JSON.stringify(wire, null, pretty ? 2 : undefined);
}

export function safeJsonParse(json: string): any {
  return readValues(json);
}
