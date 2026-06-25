/** Default send timeout — fail fast instead of hanging when the network is flaky/offline. */
export const DEFAULT_SEND_TIMEOUT_MS = 4000;

/**
 * `fetch` with a hard timeout via AbortController. On timeout the request is
 * aborted and the returned promise rejects, so an offline/slow network never
 * blocks the telemetry pipeline indefinitely.
 */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs = DEFAULT_SEND_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
