import { IntegrationEvent } from "@sincpro/mobile/domain/events/integration_event";
import { textOf } from "@sincpro/mobile/domain/events/label";

export class PrintImageRequestedEvent extends IntegrationEvent {
  static readonly name = "common.print.v1.image_requested";
  static readonly label = {
    es: "Imprimiendo...",
    en: "Printing...",
  };
  static readonly requiresNetwork = false;

  public readonly name = PrintImageRequestedEvent.name;
  public readonly label = textOf(PrintImageRequestedEvent.label);
  public readonly requiresNetwork = PrintImageRequestedEvent.requiresNetwork;

  public imageBase64: string = "";
  public width: number = 0;
  public height: number = 0;
  public title: string = "";
  /** The print notice it updates; empty in events stored before it existed (then the uuid). */
  public jobId: string = "";
}
