import type { IntegrationEvent } from "@sincpro/mobile/domain/events";

/**
 * Runs around one subscriber processing one event, like an interceptor of sincpro_framework.
 * It sees the event, can act before and after `next`, observe a failure (`next` throws) or
 * veto the work (not calling `next`). The app changes core behavior from outside, without
 * modifying the subscriber.
 */
export type EventInterceptor = (
  event: IntegrationEvent,
  next: () => Promise<void>,
  context: { subscriber: string },
) => Promise<void>;

/** Registers for every event; these wrap the interceptors of a named event. */
export const ANY_EVENT = "*";

const registry = new Map<string, EventInterceptor[]>();

/**
 * Adds an interceptor around every subscriber of `eventName` (`ANY_EVENT` for all of them).
 * Interceptors run in registration order, the first one outermost. Returns its removal.
 */
export function interceptEvent(eventName: string, interceptor: EventInterceptor): () => void {
  const list = registry.get(eventName) ?? [];
  registry.set(eventName, [...list, interceptor]);
  return () => {
    registry.set(
      eventName,
      (registry.get(eventName) ?? []).filter((item) => item !== interceptor),
    );
  };
}

/** Runs `handler` inside the interceptors of the event: `ANY_EVENT` ones first, then the named. */
export function runIntercepted(
  event: IntegrationEvent,
  subscriber: string,
  handler: () => Promise<void>,
): Promise<void> {
  const chain = [...(registry.get(ANY_EVENT) ?? []), ...(registry.get(event.name) ?? [])];
  const run = (index: number): Promise<void> =>
    index >= chain.length
      ? handler()
      : chain[index](event, () => run(index + 1), { subscriber });
  return run(0);
}

/** Removes every interceptor; for tests. */
export function clearEventInterceptors(): void {
  registry.clear();
}
