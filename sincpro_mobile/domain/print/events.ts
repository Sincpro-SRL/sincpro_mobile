import { IntegrationEvent } from "@sincpro/mobile/domain/events/integration_event";

export class PrintImageRequestedEvent extends IntegrationEvent {
  static readonly name = "common.print.v1.image_requested";
  static readonly label = "Imprimiendo...";
  static readonly requiresNetwork = false;
  static readonly ui = true;

  public readonly name = PrintImageRequestedEvent.name;
  public readonly label = PrintImageRequestedEvent.label;
  public readonly requiresNetwork = PrintImageRequestedEvent.requiresNetwork;

  public imageBase64: string = "";
  public width: number = 0;
  public height: number = 0;
  public title: string = "";
}
