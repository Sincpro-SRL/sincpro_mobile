import { WebViewMessageReceivedEvent } from "@sincpro/mobile/domain/events";
import { Subscriber } from "@sincpro/mobile/event_driven";
import { printerService } from "@sincpro/mobile/services/printer.service";
import { webViewService } from "@sincpro/mobile/services/webview.service";

export class ProcessWebViewMessageSubscriber extends Subscriber {
  public readonly requiresAuth = false;
  listen = [WebViewMessageReceivedEvent];

  async process(event: WebViewMessageReceivedEvent): Promise<void> {
    const parsed = webViewService.parseMessage(event.raw);

    if (!parsed || !webViewService.isPrintImage(parsed)) return;

    await printerService.enqueuePrintImage({
      imageBase64: parsed.image,
      width: parsed.width,
      height: parsed.height,
      title: parsed.metadata.title,
    });
  }
}
