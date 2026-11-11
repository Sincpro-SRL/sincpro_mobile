import { Command } from "@sincpro/client-framework";
import type { EventRecord } from "@sincpro/mobile/domain/events";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";
import {
  DEFAULT_EVENT_RETENTION_DAYS,
  RECENT_EVENTS_LIMIT,
} from "@sincpro/mobile/services/event.service";

export class CommandListRecentEvents extends Command<EventRecord[]> {
  constructor(readonly limit: number = RECENT_EVENTS_LIMIT) {
    super();
  }
}

export class CommandListFailedEvents extends Command<EventRecord[]> {}

/** Answers how many went back to the queue: one already retried by someone else does not. */
export class CommandRetryEvents extends Command<number> {
  constructor(readonly records: readonly EventRecord[]) {
    super();
  }
}

export class CommandResendEvent extends Command<void> {
  constructor(readonly record: EventRecord) {
    super();
  }
}

export class CommandDeleteEvents extends Command<void> {
  constructor(readonly records: readonly EventRecord[]) {
    super();
  }
}

export class CommandPruneEventHistory extends Command<void> {
  constructor(readonly retentionDays: number = DEFAULT_EVENT_RETENTION_DAYS) {
    super();
  }
}

/** The latest stored events, newest first — the events screen. */
@commonBoundedContext.feature(CommandListRecentEvents)
export class ListRecentEvents extends Feature<CommandListRecentEvents, EventRecord[]> {
  async execute(command: CommandListRecentEvents): Promise<EventRecord[]> {
    const records = await this.events.listRecentEvents(command.limit);
    this.span.set({ "events.count": records.length });
    return records;
  }
}

/** The events the queue set aside — the failed events screen. */
@commonBoundedContext.feature(CommandListFailedEvents)
export class ListFailedEvents extends Feature<CommandListFailedEvents, EventRecord[]> {
  async execute(): Promise<EventRecord[]> {
    const records = await this.events.listFailedEvents();
    this.span.set({ "events.count": records.length });
    return records;
  }
}

/** Puts set-aside events back in the queue, once per failure. */
@commonBoundedContext.feature(CommandRetryEvents)
export class RetryEvents extends Feature<CommandRetryEvents, number> {
  async execute(command: CommandRetryEvents): Promise<number> {
    const moved = await this.events.retryEvents(command.records);
    this.span.set({ "events.asked": command.records.length, "events.retried": moved });
    this.logger.info("Events retried", { asked: command.records.length, retried: moved });
    return moved;
  }
}

/** Sends one event again: a failed one goes back to the queue, another is published anew. */
@commonBoundedContext.feature(CommandResendEvent)
export class ResendEvent extends Feature<CommandResendEvent, void> {
  async execute(command: CommandResendEvent): Promise<void> {
    this.span.set({ "event.id": command.record.id, "event.name": command.record.name });
    await this.events.resendEvent(command.record);
  }
}

/** Removes stored events the person chose. */
@commonBoundedContext.feature(CommandDeleteEvents)
export class DeleteEvents extends Feature<CommandDeleteEvents, void> {
  async execute(command: CommandDeleteEvents): Promise<void> {
    this.span.set({ "events.count": command.records.length });
    this.logger.info("Events deleted", { count: command.records.length });
    await this.events.deleteEvents(command.records);
  }
}

/** Forgets delivered events older than the retention — the app runs it when it starts. */
@commonBoundedContext.feature(CommandPruneEventHistory)
export class PruneEventHistory extends Feature<CommandPruneEventHistory, void> {
  async execute(command: CommandPruneEventHistory): Promise<void> {
    this.span.set({ "events.retention_days": command.retentionDays });
    await this.events.pruneHistory(command.retentionDays);
  }
}
