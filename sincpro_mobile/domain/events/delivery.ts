import type {
  DeliveryFailure,
  DomainEvent,
  JsonValue,
  MessageKind,
  StoredState,
} from "@sincpro/client-framework";

import { type LabelText, textOf } from "./label";

/**
 * What a message class — an event or a Command — declares about its delivery on a phone, beside
 * its wire name:
 *
 *     class PrintImageRequestedEvent extends DomainEvent {
 *       static readonly eventName = "common.print.v1.image_requested";
 *       static readonly label = { es: "Imprimiendo...", en: "Printing..." };
 *       static readonly requiresSession = false;   // a page may print before signing in
 *     }
 *     class CommandSendMessage extends Command<Sent> {
 *       static readonly requiresNetwork = true;    // waits for the connection and the server
 *       static readonly retries = 2;               // sent again twice after a failure
 *     }
 *
 * Context: what a message needs is the message's to say, and an application changes it by its
 * name (`AppConfig.events.byName`) — never the queue's:
 * - `requiresNetwork`: it waits for a connection, and a server that is not there makes it wait,
 *   not fail (client-framework's `WAITING_KINDS`). False when unsaid.
 * - `requiresSession`: it waits for a signed-in session. True when unsaid.
 * - `retries`: sent again after a failure; the app's `events.retries` (0) when unsaid.
 * - `maxAttempts`: every send, waits included; the app's `events.maxAttempts` (no limit) when
 *   unsaid.
 * - `label` and `ui`: what a person reads, and whether the activity toast shows it.
 */
export type DeliveryDeclaration = {
  readonly label?: LabelText;
  readonly requiresNetwork?: boolean;
  readonly requiresSession?: boolean;
  readonly retries?: number;
  readonly maxAttempts?: number;
  readonly ui?: boolean;
};

/** What an application changes of one message's delivery, by its name. */
export type DeliveryOverride = Pick<
  DeliveryDeclaration,
  "requiresNetwork" | "requiresSession" | "retries" | "maxAttempts"
>;

/** Days a stored message is kept, or `"forever"`. */
export type Retention = number | "forever";

/**
 * What an application sets of its stored messages — every key optional, its default beside it:
 *
 *     events: {
 *       retries: 0,                                  // sent again after a failure
 *       maxAttempts: Infinity,                       // every send, waits included
 *       backoff: { first: 1_000, longest: 60_000 },  // ms between sends
 *       keep: { delivered: 7, failed: "forever" },   // days kept, by how they ended
 *       byName: { "chat.CommandSendMessage": { retries: 2 } },  // a Command by its identity
 *     }
 */
export type EventsConfig = {
  readonly retries?: number;
  readonly maxAttempts?: number;
  readonly backoff?: { readonly first?: number; readonly longest?: number };
  readonly keep?: { readonly delivered?: Retention; readonly failed?: Retention };
  readonly byName?: Readonly<Record<string, DeliveryOverride>>;
};

/** What a message's delivery waits for. */
export type DeliveryNeeds = { readonly network: boolean; readonly session: boolean };

/** What a declaration — a class's, with the app's over it — asks its delivery to wait for. */
export function deliveryNeedsOf(declared: DeliveryDeclaration): DeliveryNeeds {
  return {
    network: declared.requiresNetwork === true,
    session: declared.requiresSession !== false,
  };
}

/** What the class of a message declares — nothing, when nobody here knows it. */
export function declarationOf(type: object | undefined): DeliveryDeclaration {
  return (type ?? {}) as DeliveryDeclaration;
}

/** What a person reads for an event: its class's label, or its wire name. */
export function labelOf(type: object | undefined, name: string): LabelText {
  const declared = (type ?? {}) as DeliveryDeclaration;
  return declared.label && textOf(declared.label) ? declared.label : name;
}

/** Whether a message's delivery is shown in the activity toast. */
export function showsDelivery(type: object | undefined): boolean {
  return ((type ?? {}) as DeliveryDeclaration).ui === true;
}

/** An event class with no arguments: what an aggregate records with its values. */
export type RecordableEvent<E extends DomainEvent> = (new () => E) & {
  readonly eventName: string;
};

/** The values of an event, without its reserved `name`. */
export type EventValues<E extends DomainEvent> = Partial<Omit<E, "name">>;

/** A new event of `EventClass` with `values`. */
export function newEvent<E extends DomainEvent>(
  EventClass: RecordableEvent<E>,
  values?: EventValues<E>,
): E {
  return Object.assign(new EventClass(), values);
}

/**
 * One stored event as the screens read it: who it is, how its delivery went and what it
 * carries. `state` is the stored queue's — `pending`, `delivered`, `set_aside` (the failed ones).
 */
export type EventRecord = {
  readonly id: string;
  /** A fact for whoever hears it, or an intention for the bus that consumes it. */
  readonly kind: MessageKind;
  readonly name: string;
  /** What a person reads: its class's label, or its wire name. */
  readonly label: string;
  readonly state: StoredState;
  readonly attempts: number;
  readonly publishedAt: string;
  readonly settledAt: string | null;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly failures: readonly DeliveryFailure[];
  /** Why the last attempt failed, for a person; `null` when nothing failed. */
  readonly error: string | null;
  readonly payload: JsonValue;
  /** What a Command answered, once delivered; `null` for an event. */
  readonly answer: JsonValue | null;
};
