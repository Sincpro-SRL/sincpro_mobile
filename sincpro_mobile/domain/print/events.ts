import { DomainEvent } from "@sincpro/client-framework";

export class PrintImageRequestedEvent extends DomainEvent {
  static readonly eventName = "common.print.v1.image_requested";
  static readonly label = {
    es: "Imprimiendo...",
    en: "Printing...",
  };
  static readonly requiresSession = false;

  imageBase64: string = "";
  width: number = 0;
  height: number = 0;
  title: string = "";
  /** The print notice it updates; empty in events stored before it existed (then the id). */
  jobId: string = "";
}
