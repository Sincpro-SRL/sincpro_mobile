import { DomainException } from "@sincpro/mobile/exceptions";
import { deliverTelemetryNow } from "@sincpro/mobile/infrastructure/telemetry/init_telemetry";
import { logCrash } from "@sincpro/mobile/infrastructure/ui/crash";
import { Alert } from "react-native";

/** React Native's global handler: what reaches the JS thread's top uncaught. */
export type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;

/** How long a fatal error waits for its line to leave before the app closes. */
export const FATAL_DELIVERY_MS = 2000;

function within(work: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    work
      .catch(() => undefined)
      .then(() => {
        clearTimeout(timer);
        resolve();
      });
  });
}

/**
 * The global handler the core installs over the one before it (`next`) — React Native's, or
 * the error client's when the app set one up (Sentry's SDK installs its own, which reports to
 * GlitchTip, flushes and hands over):
 * 1. A `DomainException` is the business answering: the person reads it, nothing is reported.
 * 2. Anything else is written with its stack (`logCrash`) and handed to `next`, which reports it.
 * 3. A fatal one closes the app: its line is sent first (`deliver`), for `FATAL_DELIVERY_MS` at
 *    most, and then handed over.
 */
export function globalErrorHandler(
  next: GlobalErrorHandler | undefined,
  deliver: () => Promise<unknown>,
  explain: (error: DomainException) => void,
): GlobalErrorHandler {
  return (error, isFatal) => {
    if (error instanceof DomainException) {
      explain(error);
      return;
    }
    logCrash(error, isFatal ? "react-native global (fatal)" : "react-native global");
    if (!isFatal) {
      next?.(error, isFatal);
      return;
    }
    void within(deliver(), FATAL_DELIVERY_MS).then(() => next?.(error, isFatal));
  };
}

let installed = false;

/**
 * Puts the core's global handler in place, once — `defineAppShell` does it, after the app's
 * error client set up its own. Where there is no `ErrorUtils` (the web, Node) it does nothing.
 */
export function installGlobalErrorHandler(): void {
  const errorUtils = (globalThis as { ErrorUtils?: ReactNativeErrorUtils }).ErrorUtils;
  if (installed || !errorUtils?.setGlobalHandler) return;
  installed = true;
  const next = errorUtils.getGlobalHandler?.() ?? errorUtils._globalHandler;
  errorUtils.setGlobalHandler(
    globalErrorHandler(next, deliverTelemetryNow, (error) =>
      Alert.alert("Error", error.message, [{ text: "OK" }], { cancelable: true }),
    ),
  );
}

type ReactNativeErrorUtils = {
  setGlobalHandler?: (handler: GlobalErrorHandler) => void;
  getGlobalHandler?: () => GlobalErrorHandler;
  _globalHandler?: GlobalErrorHandler;
};
