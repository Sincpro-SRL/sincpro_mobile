import type { LayerLogger } from "@sincpro/client-framework";
import { errorAttributes } from "@sincpro/mobile/infrastructure/logger";

import type { InterceptorHooks } from "./intercept";

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
 * interceptClass(DistributionWorkflowsImp, loggingHooks(logger));
 * interceptInstance(dbCursor, loggingHooks(loggerAdapter));
 * ```
 */
export function loggingHooks(logger: LayerLogger): InterceptorHooks {
  return {
    before(call) {
      logger.debug(`→ ${call.className}.${call.methodName}`);
    },
    after(call) {
      logger.info(`✓ ${call.className}.${call.methodName}`);
    },
    onError(call, error) {
      logger.error(`✗ ${call.className}.${call.methodName}`, errorAttributes(error));
    },
  };
}
