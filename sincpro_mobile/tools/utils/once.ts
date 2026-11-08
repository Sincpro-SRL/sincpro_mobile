/**
 * Runs `task` on the first call and hands every caller the same promise. A failure
 * clears it, so the next call retries instead of replaying the error forever.
 */
export function onceUntilFailure<T>(task: () => Promise<T>): () => Promise<T> {
  let running: Promise<T> | undefined;
  return () => {
    running ??= task().catch((error: unknown) => {
      running = undefined;
      throw error;
    });
    return running;
  };
}
