import { Command } from "@sincpro/client-framework";
import { criteria } from "@sincpro/criteria";
import type { EventRecord } from "@sincpro/mobile/domain/events";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";
import { RECENT_EVENTS_LIMIT } from "@sincpro/mobile/services/events/common";

/**
 * @deprecated Read `CommandSearchEvents`: a page in SQL, with its cursor. Kept while the apps
 * move; it goes in the next major.
 */
export class CommandListRecentEvents extends Command<EventRecord[]> {
  constructor(readonly limit: number = RECENT_EVENTS_LIMIT) {
    super();
  }
}

let warned = false;

/** @deprecated The latest stored events, newest first: the first page of `CommandSearchEvents`. */
@commonBoundedContext.feature(CommandListRecentEvents)
export class ListRecentEvents extends Feature<CommandListRecentEvents, EventRecord[]> {
  async execute(command: CommandListRecentEvents): Promise<EventRecord[]> {
    this.warnOnce();
    const page = await this.eventStore.search(
      criteria<EventRecord>().limit(command.limit).counting("none"),
    );
    this.span.set({ "events.count": page.rows.length });
    return page.rows;
  }

  private warnOnce(): void {
    if (warned) return;
    warned = true;
    this.logger.warn("CommandListRecentEvents is deprecated: read CommandSearchEvents");
  }
}
