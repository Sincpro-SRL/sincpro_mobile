import { PrintImageRequestedEvent } from "@sincpro/mobile/domain/events";
import { Subscriber } from "@sincpro/mobile/event_driven";
import { DomainValidationError } from "@sincpro/mobile/exceptions";
import { takePrintImage } from "@sincpro/mobile/infrastructure/print/pending_images";
import { notifyDevice } from "@sincpro/mobile/infrastructure/ui/activity";
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
      // Without this a print with the printer off failed silently into the queue.
      notifyDevice({
        name: "printer.print_failed",
        title: "No se imprimió",
        message: event.title
          ? `«${event.title}»: revisa que la impresora esté encendida y cerca.`
          : "Revisa que la impresora esté encendida y cerca.",
        variant: "danger",
      });
      throw new DomainValidationError("No se pudo imprimir");
    }
  }
}
