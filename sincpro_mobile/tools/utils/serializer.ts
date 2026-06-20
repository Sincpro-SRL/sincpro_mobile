export function safeJsonStringify(obj: any, pretty: boolean = false): string {
  const seen = new WeakSet();

  if (pretty) {
    return JSON.stringify(
      obj,
      (key, value) => {
        if (key.startsWith("_")) {
          return undefined;
        }

        if (value instanceof Map) {
          return Object.fromEntries(value);
        }

        if (value instanceof Set) {
          return Array.from(value);
        }

        if (typeof value === "object" && value !== null) {
          if (seen.has(value)) {
            return "[Circular]";
          }
          seen.add(value);
        }

        return value;
      },
      2,
    );
  }

  return JSON.stringify(obj, (key, value) => {
    if (key.startsWith("_")) {
      return undefined;
    }

    if (value instanceof Map) {
      return Object.fromEntries(value);
    }

    if (value instanceof Set) {
      return Array.from(value);
    }

    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return "[Circular]";
      }
      seen.add(value);
    }

    return value;
  });
}

export function safeJsonParse(json: string): any {
  return JSON.parse(json);
}
