import { Command } from "@sincpro/client-framework";
import type { EventRecord } from "@sincpro/mobile/domain/events";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

export class CommandListFailedEvents extends Command<EventRecord[]> {}

/** The events the queue set aside, waiting for a person — the failed events screen. */
@commonBoundedContext.feature(CommandListFailedEvents)
export class ListFailedEvents extends Feature<CommandListFailedEvents, EventRecord[]> {
  async execute(): Promise<EventRecord[]> {
    const records = await this.eventStore.inState("set_aside");
    this.span.set({ "events.count": records.length });
    return records;
  }
}
