import { WebViewMessageReceivedEvent } from "@sincpro/mobile/domain/webview/events";
import { commonBoundedContext, EventHandler } from "@sincpro/mobile/infrastructure/framework";
import { CommandProcessWebViewMessage } from "@sincpro/mobile/services/webview/process_web_view_message.app_service";

/** A message a page posted, delivered by the queue: it executes the use case that reads it. */
@commonBoundedContext.handler([WebViewMessageReceivedEvent])
export class OnWebViewMessage extends EventHandler<WebViewMessageReceivedEvent> {
  async handle(event: WebViewMessageReceivedEvent): Promise<void> {
    await this.boundedContext.execute(new CommandProcessWebViewMessage(event.raw));
  }
}
