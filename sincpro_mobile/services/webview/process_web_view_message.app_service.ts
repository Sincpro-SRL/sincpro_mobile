import { Command } from "@sincpro/client-framework";
import {
  isPrintImageMessage,
  parseWebViewMessage,
} from "@sincpro/mobile/domain/webview/messages";
import {
  ApplicationService,
  commonBoundedContext,
} from "@sincpro/mobile/infrastructure/framework";
import { CommandQueuePrint } from "@sincpro/mobile/services/printer/print_jobs/queue_print.feature";

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
    const message = parseWebViewMessage(command.raw);
    if (!message || !isPrintImageMessage(message)) return;
    await this.featureBus.execute(
      new CommandQueuePrint(
        message.image,
        message.width,
        message.height,
        message.metadata.title,
        message.jobId ?? "",
      ),
    );
  }
}
