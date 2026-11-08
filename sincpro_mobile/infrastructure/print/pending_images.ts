/**
 * Print images wait here, not in SQLite, until their event is processed.
 * Only the latest few are kept: an event that fails before printing must not
 * pin megabytes of base64 for the rest of the session.
 */
export const MAX_PENDING_PRINT_IMAGES = 5;

const pending = new Map<string, string>();

export function holdPrintImage(id: string, imageBase64: string): void {
  pending.delete(id);
  pending.set(id, imageBase64);
  while (pending.size > MAX_PENDING_PRINT_IMAGES) {
    const oldest = pending.keys().next().value;
    if (oldest === undefined) break;
    pending.delete(oldest);
  }
}

export function takePrintImage(id: string): string | undefined {
  const image = pending.get(id);
  pending.delete(id);
  return image;
}
