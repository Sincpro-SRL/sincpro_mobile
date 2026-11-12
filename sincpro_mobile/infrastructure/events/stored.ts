import {
  type AnyCommand,
  type Cause,
  type DomainEvent,
  type Envelope,
  type MessageKind,
  type RemoteCommand,
  type RemoteEvent,
  type StoredMessage,
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
 * A message as the stored queue keeps it, waiting — what `storedQueue`'s `put` (an event) and
 * `send` (a Command) store, written here so a repository can store an event inside its own
 * transaction and ask for the delivery after.
 */
export function storedMessageOf(
  kind: MessageKind,
  message: DomainEvent | RemoteEvent | AnyCommand | RemoteCommand,
  envelope: Envelope,
): StoredMessage {
  return {
    kind,
    envelope,
    payload: valuesOf(message),
    state: "pending",
    attempts: 0,
    retryAt: null,
    reached: [],
    failures: [],
    answer: null,
  };
}
