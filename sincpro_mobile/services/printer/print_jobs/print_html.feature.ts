import { Command, newEntityId } from "@sincpro/client-framework";
import { printNoticeKey } from "@sincpro/mobile/domain/webview/print_cycle";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";
import { printFollowed } from "@sincpro/mobile/services/printer/print_jobs/common";

export class CommandPrintHtml extends Command<void> {
  constructor(
    readonly html: string,
    readonly title: string = "",
  ) {
    super();
  }
}

/** HTML rendered at the thermal width and printed, followed in its own notice. */
@commonBoundedContext.feature(CommandPrintHtml)
export class PrintHtml extends Feature<CommandPrintHtml, void> {
  async execute(command: CommandPrintHtml): Promise<void> {
    this.span.set({ "print.title": command.title });
    await printFollowed(
      this.notifier,
      { key: printNoticeKey(newEntityId()), title: command.title },
      () => this.printer.printHtml(command.html),
    );
  }
}
