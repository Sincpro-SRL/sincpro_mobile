import { Command } from "@sincpro/client-framework";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

export class CommandRestorePrinterConnection extends Command<void> {}

/**
 * One silent try to bring back the chosen printer — what the reconnection loop executes while
 * the app runs: nothing is shown; a printer that does not come back fails `unavailable`, and the
 * loop tries again later.
 */
@commonBoundedContext.feature(CommandRestorePrinterConnection)
export class RestorePrinterConnection extends Feature<CommandRestorePrinterConnection, void> {
  execute(): Promise<void> {
    return this.printer.restoreConnection();
  }
}
