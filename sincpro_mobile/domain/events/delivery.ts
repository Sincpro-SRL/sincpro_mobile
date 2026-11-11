import type {
  DeliveryFailure,
  DomainEvent,
  JsonValue,
  StoredState,
} from "@sincpro/client-framework";

import { type LabelText, textOf } from "./label";

/**
 * What an event class declares about itself on a phone, beside its wire name (`eventName`):
 *
 *     class PrintImageRequestedEvent extends DomainEvent {
 *       static readonly eventName = "common.print.v1.image_requested";
 *       static readonly label = { es: "Imprimiendo...", en: "Printing..." };
 *       static readonly requiresNetwork = false;   // prints offline
 *       static readonly requiresSession = false;   // a page may print before signing in
 *     }
 *
 * Context: whether an event may be delivered now is the event's to say — what it is about
 * needs a connection, or a signed-in session — never the subscriber's: the stored queue asks it
 * of the event's class (`deliveryNeedsOf`) and lets the rest go on while it waits. An event that
 * says nothing needs a session and no connection. `ui` asks the activity toast to show its
 * delivery.
 */
export type DeliveryDeclaration = {
  readonly label?: LabelText;
  readonly requiresNetwork?: boolean;
  readonly requiresSession?: boolean;
  readonly ui?: boolean;
};

/** What an event's delivery waits for. */
export type DeliveryNeeds = { readonly network: boolean; readonly session: boolean };

/** What the class of an event — or nothing, when nobody hears it here — asks of its delivery. */
export function deliveryNeedsOf(type: object | undefined): DeliveryNeeds {
  const declared = (type ?? {}) as DeliveryDeclaration;
  return {
    network: declared.requiresNetwork === true,
    session: declared.requiresSession !== false,
  };
}

/** What a person reads for an event: its class's label, or its wire name. */
export function labelOf(type: object | undefined, name: string): LabelText {
  const declared = (type ?? {}) as DeliveryDeclaration;
  return declared.label && textOf(declared.label) ? declared.label : name;
}

/** Whether an event's delivery is shown in the activity toast. */
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
};
