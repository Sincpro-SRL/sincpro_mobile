import { Command } from "@sincpro/client-framework";
import type { EventRecord } from "@sincpro/mobile/domain/events";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";
import { sendBack } from "@sincpro/mobile/services/events/common";

/** Answers how many went back to the queue: one already retried by someone else does not. */
export class CommandRetryEvents extends Command<number> {
  constructor(readonly records: readonly EventRecord[]) {
    super();
  }
}

/** Puts set-aside events back in the queue, once per failure. */
@commonBoundedContext.feature(CommandRetryEvents)
export class RetryEvents extends Feature<CommandRetryEvents, number> {
  async execute(command: CommandRetryEvents): Promise<number> {
    const ids = command.records.map((record) => record.id);
    const moved = await sendBack(this.eventStore, this.eventDelivery, ids);
    this.span.set({ "events.asked": ids.length, "events.retried": moved });
    this.logger.info("Events retried", { asked: ids.length, retried: moved });
    return moved;
  }
}
