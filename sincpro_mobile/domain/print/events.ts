import { DomainEvent } from "../event";

export class PrintImageRequestedEvent extends DomainEvent {
  static readonly name = "common.print.v1.image_requested";
  static readonly label = "Imprimiendo...";
  static readonly requiresNetwork = false;

  public readonly name = PrintImageRequestedEvent.name;
  public readonly label = PrintImageRequestedEvent.label;
  public readonly requiresNetwork = PrintImageRequestedEvent.requiresNetwork;

  public imageBase64: string = "";
  public width: number = 0;
  public height: number = 0;
  public title: string = "";
}
