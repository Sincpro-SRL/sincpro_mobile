import { Command } from "@sincpro/client-framework";
import { criteria } from "@sincpro/criteria";
import type { EventRecord } from "@sincpro/mobile/domain/events";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

/**
 * @deprecated Read `CommandSearchEvents` with `state = set_aside`: a page in SQL, with its cursor.
 * Kept while the apps move; it goes in the next major.
 */
export class CommandListFailedEvents extends Command<EventRecord[]> {}

let warned = false;

/**
 * @deprecated Every event the queue set aside, newest first, read a page at a time — what
 * `CommandSearchEvents` answers a page of.
 */
@commonBoundedContext.feature(CommandListFailedEvents)
export class ListFailedEvents extends Feature<CommandListFailedEvents, EventRecord[]> {
  async execute(): Promise<EventRecord[]> {
    this.warnOnce();
    const failed = criteria<EventRecord>().selection(["state", "=", "set_aside"]).limit(500);
    const records: EventRecord[] = [];
    let page = await this.eventStore.search(failed);
    records.push(...page.rows);
    while (page.cursor !== null) {
      page = await this.eventStore.search(failed.cursor(page.cursor));
      records.push(...page.rows);
    }
    this.span.set({ "events.count": records.length });
    return records;
  }

  private warnOnce(): void {
    if (warned) return;
    warned = true;
    this.logger.warn(
      "CommandListFailedEvents is deprecated: read CommandSearchEvents with state = set_aside",
    );
  }
}
