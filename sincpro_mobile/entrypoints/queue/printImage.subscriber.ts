import { PrintImageRequestedEvent } from "@sincpro/mobile/domain/events";
import { Subscriber } from "@sincpro/mobile/event_driven";
import { DomainValidationError } from "@sincpro/mobile/exceptions";
import { printerService } from "@sincpro/mobile/services/printer.service";

export class PrintImageSubscriber extends Subscriber {
  public readonly requiresAuth = false;
  listen = [PrintImageRequestedEvent];

  async process(event: PrintImageRequestedEvent): Promise<void> {
    const printed = await printerService.printImageBase64(event.imageBase64);
    if (!printed) {
      throw new DomainValidationError("No se pudo imprimir");
    }
  }
}
