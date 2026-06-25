import type { InterceptorHooks } from "./intercept";

/** Minimal logger contract — compatible with the framework's ILogger and any custom logger. */
export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/**
 * Produces `InterceptorHooks` that log every method call through the given logger.
 *
 * - `before`  → debug: method entry with class and method name
 * - `after`   → info:  method exited successfully
 * - `onError` → error: method threw or rejected, includes the error
 *
 * Args and return values are intentionally not logged to avoid leaking sensitive data.
 *
 * ```ts
 * interceptClass(DistributionWorkflowsImp, loggingHooks(loggerUseCases));
 * interceptInstance(dbCursor, loggingHooks(loggerRepositories));
 * ```
 */
export function loggingHooks(logger: Logger): InterceptorHooks {
  return {
    before(call) {
      logger.debug(`→ ${call.className}.${call.methodName}`);
    },
    after(call) {
      logger.info(`✓ ${call.className}.${call.methodName}`);
    },
    onError(call, error) {
      logger.error(`✗ ${call.className}.${call.methodName}`, error);
    },
  };
}
