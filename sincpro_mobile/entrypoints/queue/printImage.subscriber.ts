import { PrintImageRequestedEvent } from "@sincpro/mobile/domain/events";
import { Subscriber } from "@sincpro/mobile/event_driven";
import { DomainValidationError } from "@sincpro/mobile/exceptions";
import { takePrintImage } from "@sincpro/mobile/infrastructure/print/pending_images";
import { printerService } from "@sincpro/mobile/services/printer.service";

export class PrintImageSubscriber extends Subscriber {
  public readonly requiresAuth = false;
  listen = [PrintImageRequestedEvent];

  async process(event: PrintImageRequestedEvent): Promise<void> {
    const held = takePrintImage(event.uuid);
    const image = held || event.imageBase64;
    if (!image || image.startsWith("[omitido")) {
      throw new DomainValidationError("No se pudo imprimir");
    }
    const printed = await printerService.printImageBase64(image);
    if (!printed) {
      throw new DomainValidationError("No se pudo imprimir");
    }
  }
}
