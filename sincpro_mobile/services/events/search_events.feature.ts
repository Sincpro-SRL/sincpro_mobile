import { Command } from "@sincpro/client-framework";
import { type Criteria, type CriteriaFor, type Page, plain } from "@sincpro/criteria";
import type { EventRecord } from "@sincpro/mobile/domain/events";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

export class CommandSearchEvents extends Command<Page<EventRecord>> {
  readonly criteria: Criteria<EventRecord>;

  constructor(criteria: CriteriaFor<EventRecord> = {}) {
    super();
    this.criteria = plain(criteria);
  }
}

/**
 * A page of the stored events, newest first — what the event screens read, filtered and paged
 * in SQL: a screen asks the next page with its cursor, never the whole history.
 */
@commonBoundedContext.feature(CommandSearchEvents)
export class SearchEvents extends Feature<CommandSearchEvents, Page<EventRecord>> {
  async execute(command: CommandSearchEvents): Promise<Page<EventRecord>> {
    const page = await this.eventStore.search(command.criteria);
    this.span.set({ "events.rows": page.rows.length });
    return page;
  }
}
