import { Command, type StoredState } from "@sincpro/client-framework";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

export class CommandClearEvents extends Command<number> {
  constructor(
    /**
     * What is emptied: the history and the failed ones by default. `pending` only when named —
     * what has not been delivered yet then never happens.
     */
    readonly states: readonly StoredState[] = ["delivered", "set_aside"],
  ) {
    super();
  }
}

/**
 * Empties the stored events in the states the Command names, when an app or the person asks for
 * it — nothing runs it on its own:
 * 1. Every event in those states is deleted, whatever its age.
 * Final: how many went.
 */
@commonBoundedContext.feature(CommandClearEvents)
export class ClearEvents extends Feature<CommandClearEvents, number> {
  async execute(command: CommandClearEvents): Promise<number> {
    const cleared = await this.eventStore.clearIn(command.states);
    this.span.set({ "events.states": command.states.join(","), "events.count": cleared });
    this.logger.info("Events cleared", {
      states: command.states.join(","),
      count: cleared,
    });
    return cleared;
  }
}
