import { Directory, File, Paths } from "expo-file-system";

/** Failed prints kept on disk, newest first; older ones are deleted. */
export const MAX_FAILED_PRINT_FILES = 20;

const folder = () => new Directory(Paths.cache, "failed-prints");

/** The files to delete so only the newest `max` remain. */
export function filesToPrune<T extends { modificationTime?: number | null }>(
  files: T[],
  max: number = MAX_FAILED_PRINT_FILES,
): T[] {
  return [...files]
    .sort((a, b) => (b.modificationTime ?? 0) - (a.modificationTime ?? 0))
    .slice(max);
}

/**
 * Keeps the image of a print that did not come out, so the user can see what failed
 * (`DocumentPreview` reads the file). The cache folder keeps only the newest
 * `MAX_FAILED_PRINT_FILES`. Resolves the file URI, or `null` if it could not be written.
 */
export async function keepFailedPrintImage(
  id: string,
  imageBase64: string,
): Promise<string | null> {
  try {
    const dir = folder();
    if (!dir.exists) dir.create({ idempotent: true });
    const file = new File(dir, `${id}.png`);
    await file.write(imageBase64, { encoding: "base64" });
    const files = dir.list().filter((item): item is File => item instanceof File);
    for (const old of filesToPrune(files)) old.delete();
    return file.uri;
  } catch {
    return null;
  }
}

/** The URI of a failed print's image, or `null` when it was not kept or was pruned. */
export function failedPrintImageUri(id: string): string | null {
  try {
    const file = new File(folder(), `${id}.png`);
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}
