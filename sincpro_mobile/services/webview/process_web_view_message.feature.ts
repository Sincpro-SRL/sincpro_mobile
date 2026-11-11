import { Command, Feature } from "@sincpro/client-framework";
import type { PrinterService } from "@sincpro/mobile/services/printer.service";
import type { WebViewService } from "@sincpro/mobile/services/webview.service";

export class CommandProcessWebViewMessage extends Command<void> {
  constructor(readonly raw: string) {
    super();
  }
}

/** A message a page posted: a print image is queued to print; anything else is ignored. */
export class ProcessWebViewMessage extends Feature<CommandProcessWebViewMessage, void> {
  static readonly serviceName = "ProcessWebViewMessage";
  declare readonly webView: WebViewService;
  declare readonly printer: PrinterService;

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
