import { Command, newEntityId } from "@sincpro/client-framework";
import type { EventRecord } from "@sincpro/mobile/domain/events";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";
import { sendBack } from "@sincpro/mobile/services/events/common";

export class CommandResendEvent extends Command<void> {
  constructor(readonly record: EventRecord) {
    super();
  }
}

/**
 * Sends one message again:
 * 1. A set-aside one goes back to wait, once per failure.
 * Final: any other is stored anew — a new message with the same name and values, in the same
 *    flow, caused by the first one — and delivered.
 */
@commonBoundedContext.feature(CommandResendEvent)
export class ResendEvent extends Feature<CommandResendEvent, void> {
  async execute(command: CommandResendEvent): Promise<void> {
    const { record } = command;
    this.span.set({ "event.id": record.id, "event.name": record.name });
    if (record.state === "set_aside") {
      await sendBack(this.eventStore, this.eventDelivery, [record.id]);
      return;
    }
    await this.eventStore.add({
      envelope: {
        name: record.name,
        id: newEntityId(),
        correlationId: record.correlationId,
        causationId: record.id,
        publishedAt: new Date().toISOString(),
      },
      payload: record.payload,
      state: "pending",
      attempts: 0,
      retryAt: null,
      reached: [],
      failures: [],
    });
    void this.eventDelivery.drain();
  }
}
