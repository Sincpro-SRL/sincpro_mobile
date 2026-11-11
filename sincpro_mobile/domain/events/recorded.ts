import { type DomainEvent, newEntityId, valuesOf } from "@sincpro/client-framework";

/**
 * One event an aggregate recorded: the event, the id its envelope will carry, its place among
 * what the aggregate recorded, and the flow it belongs to.
 */
export type Recorded = {
  readonly id: string;
  readonly event: DomainEvent;
  readonly sequence: number;
  readonly correlationId: string;
};

/**
 * What an aggregate — an entity, a collection — records until its repository stores it.
 *
 * Context: the events one aggregate records before one save are one flow: they share a
 * `correlationId`, the first one's id, and keep their order (`sequence`). The same event with the
 * same values recorded twice is one event. Nothing here knows the envelope or the queue: the
 * repository turns each record into a stored event when it saves the aggregate.
 */
export class RecordedEvents {
  private items: Recorded[] = [];
  private flow: string | null = null;

  /** Records `event`; answers its id — the one already recorded, for a repeated event. */
  record(event: DomainEvent): { id: string; repeated: boolean } {
    const values = JSON.stringify(valuesOf(event));
    const same = this.items.find(
      (item) =>
        item.event.name === event.name && JSON.stringify(valuesOf(item.event)) === values,
    );
    if (same) return { id: same.id, repeated: true };
    const id = newEntityId();
    this.flow ??= id;
    this.items.push({ id, event, sequence: this.items.length + 1, correlationId: this.flow });
    return { id, repeated: false };
  }

  /** The records, each with a copy of its event: changing one never changes what was recorded. */
  list(): readonly Recorded[] {
    return this.items.map((item) => ({
      ...item,
      event: Object.assign(Object.create(Object.getPrototypeOf(item.event)), item.event),
    }));
  }

  /** Takes every record: the aggregate starts a new flow. */
  take(): Recorded[] {
    const taken = this.items;
    this.items = [];
    this.flow = null;
    return taken;
  }

  /** Puts records back, after a save that did not store them. */
  restore(items: readonly Recorded[]): void {
    for (const item of items) {
      if (!this.items.some((one) => one.id === item.id)) this.items.push(item);
    }
    this.flow ??= items[0]?.correlationId ?? null;
  }

  /** The records as they were before a save that rolled back. */
  replace(items: readonly Recorded[]): void {
    this.items = [...items];
    this.flow = items[0]?.correlationId ?? null;
  }
}
