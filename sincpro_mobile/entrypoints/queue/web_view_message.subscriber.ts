import { type BoundedContext, EventSubscriber } from "@sincpro/client-framework";
import { WebViewMessageReceivedEvent } from "@sincpro/mobile/domain/events";
import type { CommonDependencies } from "@sincpro/mobile/infrastructure/bounded_context";
import { CommandProcessWebViewMessage } from "@sincpro/mobile/services/webview/process_web_view_message.feature";

export class WebViewMessageSubscriber extends EventSubscriber<WebViewMessageReceivedEvent> {
  static readonly subscriberName = "WebViewMessage";
  declare readonly commonBoundedContext: BoundedContext<CommonDependencies>;

  async handle(event: WebViewMessageReceivedEvent): Promise<void> {
    await this.commonBoundedContext.execute(new CommandProcessWebViewMessage(event.raw));
  }
}
