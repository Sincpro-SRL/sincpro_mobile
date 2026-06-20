import { DomainEvent } from "@sincpro/mobile/domain/event";

export class WebViewMessageReceivedEvent extends DomainEvent {
  static readonly name = "common.webview.v1.message_received";
  static readonly label = "Procesando datos de la web";
  static readonly requiresNetwork = false;

  public readonly name = WebViewMessageReceivedEvent.name;
  public readonly label = WebViewMessageReceivedEvent.label;
  public readonly requiresNetwork = WebViewMessageReceivedEvent.requiresNetwork;

  public raw: string = "";
  public source: string = "";
}
