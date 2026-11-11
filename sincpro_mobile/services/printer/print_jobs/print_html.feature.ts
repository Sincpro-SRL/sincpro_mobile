import { Command, newEntityId } from "@sincpro/client-framework";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";
import {
  printedNotice,
  printFailedNotice,
  printingNotice,
  printNoticeKey,
} from "@sincpro/mobile/services/printer/print_jobs/common";

export class CommandPrintHtml extends Command<void> {
  constructor(
    readonly html: string,
    readonly title: string = "",
  ) {
    super();
  }
}

/**
 * HTML rendered at the thermal width and printed, followed in its own notice: "Imprimiendo",
 * then "Impreso" — or why not, and the failure keeps its kind.
 */
@commonBoundedContext.feature(CommandPrintHtml)
export class PrintHtml extends Feature<CommandPrintHtml, void> {
  async execute(command: CommandPrintHtml): Promise<void> {
    this.span.set({ "print.title": command.title });
    await this.print(printNoticeKey(newEntityId()), command.title, command.html);
  }

  private async print(key: string, title: string, html: string): Promise<void> {
    this.notifier.notify(printingNotice(key, title));
    try {
      await this.printer.printHtml(html);
    } catch (error) {
      this.notifier.notify(printFailedNotice(key, title, error));
      throw error;
    }
    this.notifier.notify(printedNotice(key, title));
  }
}
