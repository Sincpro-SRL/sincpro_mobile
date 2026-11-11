import { Command } from "@sincpro/client-framework";
import type { EventRecord } from "@sincpro/mobile/domain/events";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

export class CommandDeleteEvents extends Command<void> {
  constructor(readonly records: readonly EventRecord[]) {
    super();
  }
}

/** Deletes stored events for good: what they would have done never happens. */
@commonBoundedContext.feature(CommandDeleteEvents)
export class DeleteEvents extends Feature<CommandDeleteEvents, void> {
  async execute(command: CommandDeleteEvents): Promise<void> {
    await this.eventStore.remove(command.records.map((record) => record.id));
    this.span.set({ "events.count": command.records.length });
    this.logger.info("Events deleted", { count: command.records.length });
  }
}
