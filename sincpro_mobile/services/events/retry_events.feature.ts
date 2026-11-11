import { Command } from "@sincpro/client-framework";
import type { EventRecord } from "@sincpro/mobile/domain/events";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

/** Answers how many went back to the queue: one already retried by someone else does not. */
export class CommandRetryEvents extends Command<number> {
  constructor(readonly records: readonly EventRecord[]) {
    super();
  }
}

/**
 * Puts set-aside events back in the queue, once per failure — a second retry of the same one
 * finds nothing:
 * 1. The store moves them back to wait.
 * Final: what went back is delivered.
 */
@commonBoundedContext.feature(CommandRetryEvents)
export class RetryEvents extends Feature<CommandRetryEvents, number> {
  async execute(command: CommandRetryEvents): Promise<number> {
    const ids = command.records.map((record) => record.id);
    const moved = await this.eventStore.retry(ids);
    if (moved > 0) void this.eventDelivery.drain();
    this.span.set({ "events.asked": ids.length, "events.retried": moved });
    this.logger.info("Events retried", { asked: ids.length, retried: moved });
    return moved;
  }
}
