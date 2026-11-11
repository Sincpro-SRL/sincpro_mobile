import { Command } from "@sincpro/client-framework";
import { WebViewMessageReceivedEvent } from "@sincpro/mobile/domain/webview/events";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

export class CommandProcessWebViewMessage extends Command<void> {
  constructor(readonly raw: string) {
    super();
  }
}

/** A message a page posted: a print image is queued to print; anything else is ignored. */
@commonBoundedContext.feature([CommandProcessWebViewMessage, WebViewMessageReceivedEvent])
export class ProcessWebViewMessage extends Feature<
  CommandProcessWebViewMessage | WebViewMessageReceivedEvent,
  void
> {
  async execute(
    request: CommandProcessWebViewMessage | WebViewMessageReceivedEvent,
  ): Promise<void> {
    const parsed = this.webView.parseMessage(request.raw);
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
