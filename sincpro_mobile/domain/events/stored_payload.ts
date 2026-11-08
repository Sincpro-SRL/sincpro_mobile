export const STORED_TEXT_LIMIT = 256;

/**
 * Persistence keeps a short marker instead of a multi-megabyte string.
 * The in-memory field is restored before the caller continues, so the
 * subscriber still sees the original value.
 */
export function serializeWithoutHeavyField(
  record: object,
  field: string,
  limit: number,
  serialize: () => string,
): string {
  const target = record as Record<string, unknown>;
  const value = target[field];
  const heavy = typeof value === "string" && value.length > limit;
  if (heavy) target[field] = `[omitido ${value.length} bytes]`;
  try {
    return serialize();
  } finally {
    if (heavy) target[field] = value;
  }
}
