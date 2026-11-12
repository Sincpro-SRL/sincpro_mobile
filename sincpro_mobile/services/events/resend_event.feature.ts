import { Command, newEntityId } from "@sincpro/client-framework";
import type { EventRecord } from "@sincpro/mobile/domain/events";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

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
    if (record.state === "set_aside") await this.sendBack(record);
    else await this.storeAgain(record);
  }

  private async sendBack(record: EventRecord): Promise<void> {
    const moved = await this.eventStore.retry([record.id]);
    if (moved > 0) void this.eventDelivery.drain();
  }

  private async storeAgain(record: EventRecord): Promise<void> {
    await this.eventStore.add({
      kind: record.kind,
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
      answer: null,
    });
    void this.eventDelivery.drain();
  }
}
