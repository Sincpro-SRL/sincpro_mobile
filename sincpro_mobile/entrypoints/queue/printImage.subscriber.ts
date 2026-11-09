import { PrintImageRequestedEvent } from "@sincpro/mobile/domain/events";
import { Subscriber } from "@sincpro/mobile/event_driven";
import { DomainValidationError } from "@sincpro/mobile/exceptions";
import { notifyDevice } from "@sincpro/mobile/infrastructure/ui/activity";
import { printerService } from "@sincpro/mobile/services/printer.service";

export class PrintImageSubscriber extends Subscriber {
  public readonly requiresAuth = false;
  listen = [PrintImageRequestedEvent];

  /**
   * Prints the image the event carries (every print event keeps it, printed or failed; the
   * history is cleaned by retention and on logout):
   * 1. Without the image (an event stored by an older version, with only a marker) nothing
   *    is printed.
   * 2. Printed: the user sees "Impreso".
   * 3. Not printed: the user sees why, with a way to the failed prints and to the printer.
   * Final: a failure throws, so the event lands in the failed queue with its image, ready to
   * preview and retry.
   */
  async process(event: PrintImageRequestedEvent): Promise<void> {
    const image = event.imageBase64;
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
