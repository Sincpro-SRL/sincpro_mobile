import {
  describeFailure,
  type LogRecord,
  processIdentity,
  reportError,
} from "@sincpro/client-framework";
import { mobileLogger } from "@sincpro/mobile/infrastructure/logger";

/**
 * What failed with nobody expecting it and no use case to catch it — a screen that broke while
 * drawing, the app's start, the JS thread's global handler.
 *
 * Context: a use case reports its own failures. What fails outside one would reach only the
 * console, and in a release build the console is silent: the phone showed a blank screen and
 * Grafana had one message without a stack. Here it is one ERROR line with its stack (and, for a
 * screen, React's component stack), in the console and in Loki, with the release and build the
 * source maps are found by. What the app's error client (Sentry's SDK for React Native, sending
 * to GlitchTip) does not see by itself — a screen's error caught by the AppShell's boundary, the
 * start's — is reported here too, with the component stack linked as its cause, the way
 * `Sentry.ErrorBoundary` does it.
 */

/** The component that broke: the first frame of React's component stack. */
export function componentOf(componentStack: string | null | undefined): string | undefined {
  return componentStack?.match(/(?:^|\n)\s*(?:in|at)\s+([A-Za-z_$][\w$.]*)/)?.[1];
}

/** Where a screen broke, as a report and a line say it: `view TicketScreen`. */
export function viewOf(componentStack: string | null | undefined): string {
  return `view ${componentOf(componentStack) ?? "unknown"}`;
}

/** The ERROR line of an unexpected failure: its type, message and stack, then the component stack. */
export function crashRecord(
  error: unknown,
  where: string,
  componentStack?: string | null,
): LogRecord {
  const failure = describeFailure(error, "failed");
  const components = componentStack?.trim();
  const release = processIdentity()?.release;
  return {
    timestamp: new Date().toISOString(),
    level: "error",
    layer: "infrastructure",
    message: `Unexpected failure in ${where}`,
    attributes: { where },
    failure: components
      ? { ...failure, stack: `${failure.stack ?? ""}\nComponent stack:\n${components}` }
      : failure,
    ...(release ? { release } : {}),
  };
}

/** A screen's component stack as the error's cause: the report shows both, linked. */
function linkComponentStack(error: unknown, componentStack: string): void {
  if (!(error instanceof Error) || error.cause !== undefined) return;
  const view = new Error(error.message);
  view.name = `React ErrorBoundary ${error.name}`;
  view.stack = componentStack;
  error.cause = view;
}

/** Writes the failure's line, in the console and in Loki; never throws. */
export function logCrash(
  error: unknown,
  where: string,
  componentStack?: string | null,
): void {
  try {
    void mobileLogger.log(crashRecord(error, where, componentStack));
  } catch {
    // Telling about a failure never becomes a second one.
  }
}

/**
 * Tells a failure no use case caught:
 * 1. Its ERROR line with the stack (`logCrash`).
 * 2. Its report, once, through the process's reporter — a screen's with its component stack
 *    linked as the cause.
 */
export function tellCrash(
  error: unknown,
  where: string,
  componentStack?: string | null,
): void {
  logCrash(error, where, componentStack);
  if (componentStack) linkComponentStack(error, componentStack);
  reportError(error, where);
}
