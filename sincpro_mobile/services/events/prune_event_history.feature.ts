import { Command } from "@sincpro/client-framework";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";
import { DEFAULT_EVENT_RETENTION_DAYS } from "@sincpro/mobile/services/events/common";

const DAY_MS = 24 * 60 * 60 * 1000;

export class CommandPruneEventHistory extends Command<void> {
  constructor(
    /** Days a delivered event stays in the history; `Infinity` keeps them. */
    readonly retentionDays: number = DEFAULT_EVENT_RETENTION_DAYS,
    /**
     * Days a failed event stays from when it failed; unsaid (or `Infinity`), it stays until the
     * person retries or deletes it.
     */
    readonly failedRetentionDays?: number,
  ) {
    super();
  }
}

/**
 * Forgets what the app's retention no longer needs — the app runs it when it starts:
 * 1. Delivered events published before their retention; none when it is `Infinity`.
 * 2. Failed ones set aside before theirs, only when the app set one: unsaid, a failed event
 *    waits for the person to retry or delete it.
 */
@commonBoundedContext.feature(CommandPruneEventHistory)
export class PruneEventHistory extends Feature<CommandPruneEventHistory, void> {
  async execute(command: CommandPruneEventHistory): Promise<void> {
    const delivered = this.cutoffOf(command.retentionDays);
    if (delivered) await this.eventStore.pruneDeliveredBefore(delivered);
    const failed = this.cutoffOf(command.failedRetentionDays);
    if (failed) await this.eventStore.pruneFailedBefore(failed);
    this.span.set({
      ...(delivered ? { "events.delivered_before": delivered } : {}),
      ...(failed ? { "events.failed_before": failed } : {}),
    });
    this.logger.info("Event history pruned", {
      deliveredBefore: delivered ?? "kept",
      failedBefore: failed ?? "kept",
    });
  }

  /** The instant `days` ago; none when the events are kept (`undefined`, `Infinity`). */
  private cutoffOf(days: number | undefined): string | undefined {
    if (days === undefined || !Number.isFinite(days) || days < 0) return undefined;
    return new Date(Date.now() - days * DAY_MS).toISOString();
  }
}
