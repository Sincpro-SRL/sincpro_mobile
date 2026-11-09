import { PrintImageRequestedEvent } from "@sincpro/mobile/domain/events";
import { Subscriber } from "@sincpro/mobile/event_driven";
import { DomainValidationError } from "@sincpro/mobile/exceptions";
import { keepFailedPrintImage } from "@sincpro/mobile/infrastructure/print/failed_print_files";
import { takePrintImage } from "@sincpro/mobile/infrastructure/print/pending_images";
import { notifyDevice } from "@sincpro/mobile/infrastructure/ui/activity";
import { printerService } from "@sincpro/mobile/services/printer.service";

export class PrintImageSubscriber extends Subscriber {
  public readonly requiresAuth = false;
  listen = [PrintImageRequestedEvent];

  /**
   * Prints the image held for this event:
   * 1. Without the image (a resent event from the history) nothing is printed.
   * 2. Printed: the user sees "Impreso".
   * 3. Not printed: the image is kept as a file for the failed list and its preview, and the
   *    user sees why, with a way to the failed prints and to the printer settings.
   * Final: a failure throws, so the event lands in the failed queue.
   */
  async process(event: PrintImageRequestedEvent): Promise<void> {
    const held = takePrintImage(event.uuid);
    const image = held || event.imageBase64;
    if (!image || image.startsWith("[omitido")) {
      throw new DomainValidationError("No se pudo imprimir");
    }
    const printed = await printerService.printImageBase64(image);
    if (printed) {
      notifyDevice({
        name: "printer.printed",
        title: "Impreso",
        message: event.title || "La impresión salió",
        variant: "success",
      });
      return;
    }
    await keepFailedPrintImage(event.uuid, image);
    notifyDevice({
      name: "printer.print_failed",
      title: "No se imprimió",
      message: event.title
        ? `«${event.title}»: revisa que la impresora esté encendida y cerca.`
        : "Revisa que la impresora esté encendida y cerca.",
      variant: "danger",
      actions: printerService.printFailureActions(),
    });
    throw new DomainValidationError("No se pudo imprimir");
  }
}
