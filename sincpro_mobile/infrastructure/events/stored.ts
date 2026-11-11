import {
  type Cause,
  type DomainEvent,
  type Envelope,
  type RemoteEvent,
  type StoredEvent,
  valuesOf,
} from "@sincpro/client-framework";
import type { Recorded } from "@sincpro/mobile/domain/events/recorded";

/**
 * The envelope of an event an aggregate recorded: its recorded id, and its flow — the run that
 * saved it when the repository was bound to one (`cause`), else the aggregate's own.
 */
export function envelopeOfRecorded(recorded: Recorded, cause?: Cause): Envelope {
  return {
    name: recorded.event.name,
    id: recorded.id,
    correlationId: cause?.correlationId ?? recorded.correlationId,
    causationId: cause?.id ?? null,
    publishedAt: new Date().toISOString(),
  };
}

/**
 * `event` as the stored queue keeps it, waiting — what `storedQueue`'s `put` stores, written here
 * so a repository can store it inside its own transaction and ask for the delivery after.
 */
export function storedEventOf(
  event: DomainEvent | RemoteEvent,
  envelope: Envelope,
): StoredEvent {
  return {
    envelope,
    payload: valuesOf(event),
    state: "pending",
    attempts: 0,
    retryAt: null,
    reached: [],
    failures: [],
  };
}
