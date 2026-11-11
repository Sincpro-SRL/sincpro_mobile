import { Command } from "@sincpro/client-framework";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";
import { DEFAULT_EVENT_RETENTION_DAYS } from "@sincpro/mobile/services/events/common";

const DAY_MS = 24 * 60 * 60 * 1000;

export class CommandPruneEventHistory extends Command<void> {
  constructor(readonly retentionDays: number = DEFAULT_EVENT_RETENTION_DAYS) {
    super();
  }
}

/** Forgets delivered events older than the retention — the app runs it when it starts. */
@commonBoundedContext.feature(CommandPruneEventHistory)
export class PruneEventHistory extends Feature<CommandPruneEventHistory, void> {
  async execute(command: CommandPruneEventHistory): Promise<void> {
    const cutoff = new Date(Date.now() - command.retentionDays * DAY_MS).toISOString();
    await this.eventStore.pruneDeliveredBefore(cutoff);
    this.span.set({ "events.retention_days": command.retentionDays });
    this.logger.info("Delivered events pruned", { before: cutoff });
  }
}
