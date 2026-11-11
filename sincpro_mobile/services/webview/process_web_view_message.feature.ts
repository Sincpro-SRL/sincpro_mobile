import { Command } from "@sincpro/client-framework";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

export class CommandProcessWebViewMessage extends Command<void> {
  constructor(readonly raw: string) {
    super();
  }
}

/** A message a page posted: a print image is queued to print; anything else is ignored. */
@commonBoundedContext.feature(CommandProcessWebViewMessage)
export class ProcessWebViewMessage extends Feature<CommandProcessWebViewMessage, void> {
  async execute(command: CommandProcessWebViewMessage): Promise<void> {
    const parsed = this.webView.parseMessage(command.raw);
    if (!parsed || !this.webView.isPrintImage(parsed)) return;
    await this.printer.enqueuePrintImage({
      imageBase64: parsed.image,
      width: parsed.width,
      height: parsed.height,
      title: parsed.metadata.title,
      jobId: parsed.jobId,
    });
  }
}
