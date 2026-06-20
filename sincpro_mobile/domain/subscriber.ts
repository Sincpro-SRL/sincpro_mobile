import { DomainEvent } from "./event";

export abstract class Subscriber {
  public abstract listen: (typeof DomainEvent)[];
  public readonly requiresAuth: boolean = true;
  abstract process(event: DomainEvent): Promise<void>;

  getEvent(event: DomainEvent): DomainEvent {
    const EventClass = this.listen.find((E) => {
      const staticName = (E as unknown as { name: string }).name;
      return staticName === event.name;
    });
    if (EventClass) {
      return (EventClass as unknown as { from: (e: DomainEvent) => DomainEvent }).from(event);
    }
    return event;
  }
}
