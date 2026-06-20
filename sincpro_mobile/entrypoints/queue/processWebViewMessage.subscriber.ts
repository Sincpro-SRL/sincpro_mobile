import { PrintImageRequestedEvent } from "@sincpro/mobile/domain/print";
import { Subscriber } from "@sincpro/mobile/domain/subscriber";
import { WebViewMessageReceivedEvent } from "@sincpro/mobile/domain/webview";
import { DomainValidationError } from "@sincpro/mobile/exceptions";
import { EventBus } from "@sincpro/mobile/infrastructure/workers";
import { webViewService } from "@sincpro/mobile/services/webview.service";

export class ProcessWebViewMessageSubscriber extends Subscriber {
  public readonly requiresAuth = false;
  listen = [WebViewMessageReceivedEvent];

  async process(event: WebViewMessageReceivedEvent): Promise<void> {
    const parsed = webViewService.parseMessage(event.raw);

    if (!parsed) {
      throw new DomainValidationError("Invalid WebView message format");
    }

    if (webViewService.isPrintImage(parsed)) {
      await EventBus.publishSync(
        PrintImageRequestedEvent.create({
          imageBase64: parsed.image,
          width: parsed.width,
          height: parsed.height,
          title: parsed.metadata.title,
        }),
      );
    }
  }
}
