/**
 * Runs `task`, then `cleanup` — also when `task` throws, and the error still reaches the
 * caller. It is `try/finally` as a function: React Compiler skips any component or hook
 * whose body has a `finally`, so hooks and handlers call this instead. A synchronous task
 * is cleaned up in the same tick; an async one when its promise settles.
 */
export function withCleanup<T>(task: () => T, cleanup: () => void): T {
  let result: T;
  try {
    result = task();
  } catch (error) {
    cleanup();
    throw error;
  }
  if (result instanceof Promise) return result.finally(cleanup) as T;
  cleanup();
  return result;
}
