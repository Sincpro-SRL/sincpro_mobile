import { Command } from "@sincpro/client-framework";
import {
  ApplicationService,
  commonBoundedContext,
} from "@sincpro/mobile/infrastructure/framework";
import { CommandQueuePrint } from "@sincpro/mobile/services/print/page_print.feature";

export class CommandProcessWebViewMessage extends Command<void> {
  constructor(readonly raw: string) {
    super();
  }
}

/**
 * A message a page posted: a print image is queued to print (`CommandQueuePrint`, a child of
 * this run); anything else is ignored.
 */
@commonBoundedContext.appService(CommandProcessWebViewMessage)
export class ProcessWebViewMessage extends ApplicationService<
  CommandProcessWebViewMessage,
  void
> {
  async execute(command: CommandProcessWebViewMessage): Promise<void> {
    const parsed = this.webView.parseMessage(command.raw);
    if (!parsed || !this.webView.isPrintImage(parsed)) return;
    await this.featureBus.execute(
      new CommandQueuePrint(
        parsed.image,
        parsed.width,
        parsed.height,
        parsed.metadata.title,
        parsed.jobId ?? "",
      ),
    );
  }
}
