import { Command } from "@sincpro/client-framework";
import type { EventsConfig, Retention } from "@sincpro/mobile/domain/events";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";
import { DEFAULT_RETENTION } from "@sincpro/mobile/services/events/common";

const DAY_MS = 24 * 60 * 60 * 1000;

export class CommandPruneEventHistory extends Command<void> {
  constructor(
    /** Days kept by how they ended (`AppConfig.events.keep`); `DEFAULT_RETENTION` when unsaid. */
    readonly keep: EventsConfig["keep"] = {},
  ) {
    super();
  }
}

/**
 * Forgets what the app's retention no longer keeps — the app runs it when it starts:
 * 1. Delivered messages published before their retention; none when it is `"forever"`.
 * 2. Failed ones set aside before theirs; by default `"forever"`: a failed message waits for a
 *    person to retry or delete it.
 */
@commonBoundedContext.feature(CommandPruneEventHistory)
export class PruneEventHistory extends Feature<CommandPruneEventHistory, void> {
  async execute(command: CommandPruneEventHistory): Promise<void> {
    const delivered = this.cutoffOf(command.keep?.delivered ?? DEFAULT_RETENTION.delivered);
    if (delivered) await this.eventStore.pruneDeliveredBefore(delivered);
    const failed = this.cutoffOf(command.keep?.failed ?? DEFAULT_RETENTION.failed);
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

  /** The instant `days` ago; none when they are kept. */
  private cutoffOf(days: Retention): string | undefined {
    if (days === "forever" || !Number.isFinite(days) || days < 0) return undefined;
    return new Date(Date.now() - days * DAY_MS).toISOString();
  }
}
