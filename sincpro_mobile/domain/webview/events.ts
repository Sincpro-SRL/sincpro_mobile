import { IntegrationEvent } from "@sincpro/mobile/domain/events/integration_event";
import {
  serializeWithoutHeavyField,
  STORED_TEXT_LIMIT,
} from "@sincpro/mobile/domain/events/stored_payload";

export class WebViewMessageReceivedEvent extends IntegrationEvent {
  static readonly name = "common.webview.v1.message_received";
  static readonly label = "Procesando datos de la web";
  static readonly requiresNetwork = false;

  public readonly name = WebViewMessageReceivedEvent.name;
  public readonly label = WebViewMessageReceivedEvent.label;
  public readonly requiresNetwork = WebViewMessageReceivedEvent.requiresNetwork;

  public raw: string = "";
  public source: string = "";

  /**
   * The raw message can carry a whole ticket image. Kept in the event history it let anyone
   * with the events screen print that ticket again, so only a short marker is stored.
   */
  override asJSON(pretty: boolean = false): string {
    return serializeWithoutHeavyField(this, "raw", STORED_TEXT_LIMIT, () =>
      super.asJSON(pretty),
    );
  }
}
