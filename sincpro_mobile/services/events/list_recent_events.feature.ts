import { Command } from "@sincpro/client-framework";
import type { EventRecord } from "@sincpro/mobile/domain/events";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";
import { RECENT_EVENTS_LIMIT } from "@sincpro/mobile/services/events/common";

export class CommandListRecentEvents extends Command<EventRecord[]> {
  constructor(readonly limit: number = RECENT_EVENTS_LIMIT) {
    super();
  }
}

/** The latest stored events, newest first — the events screen. */
@commonBoundedContext.feature(CommandListRecentEvents)
export class ListRecentEvents extends Feature<CommandListRecentEvents, EventRecord[]> {
  async execute(command: CommandListRecentEvents): Promise<EventRecord[]> {
    const records = await this.eventStore.recent(command.limit);
    this.span.set({ "events.count": records.length });
    return records;
  }
}
