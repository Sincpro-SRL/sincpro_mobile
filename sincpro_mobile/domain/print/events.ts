import { IntegrationEvent } from "@sincpro/mobile/domain/events/integration_event";
import { textOf } from "@sincpro/mobile/domain/events/label";
import {
  serializeWithoutHeavyField,
  STORED_TEXT_LIMIT,
} from "@sincpro/mobile/domain/events/stored_payload";

export class PrintImageRequestedEvent extends IntegrationEvent {
  static readonly name = "common.print.v1.image_requested";
  static readonly label = {
    es: "Imprimiendo...",
    en: "Printing...",
  };
  static readonly requiresNetwork = false;
  static readonly ui = true;

  public readonly name = PrintImageRequestedEvent.name;
  public readonly label = textOf(PrintImageRequestedEvent.label);
  public readonly requiresNetwork = PrintImageRequestedEvent.requiresNetwork;

  public imageBase64: string = "";
  public width: number = 0;
  public height: number = 0;
  public title: string = "";

  override asJSON(pretty: boolean = false): string {
    return serializeWithoutHeavyField(this, "imageBase64", STORED_TEXT_LIMIT, () =>
      super.asJSON(pretty),
    );
  }
}
