import { DomainEvent } from "@sincpro/client-framework";

export class WebViewMessageReceivedEvent extends DomainEvent {
  static readonly eventName = "common.webview.v1.message_received";
  static readonly label = "Procesando datos de la web";
  static readonly requiresSession = false;

  raw: string = "";
  source: string = "";
}
