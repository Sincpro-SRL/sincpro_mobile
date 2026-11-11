import { logger } from "@sincpro/client-framework";
import { PrintImageRequestedEvent } from "@sincpro/mobile/domain/events";
import { printNoticeKey } from "@sincpro/mobile/domain/webview/print_cycle";
import { Subscriber } from "@sincpro/mobile/event_driven";
import { DomainValidationError } from "@sincpro/mobile/exceptions";
import { errorAttributes } from "@sincpro/mobile/infrastructure/logger";
import { notifyDevice } from "@sincpro/mobile/infrastructure/ui/activity";
import { printerService } from "@sincpro/mobile/services/printer.service";

export class PrintImageSubscriber extends Subscriber {
  public readonly requiresAuth = false;
  listen = [PrintImageRequestedEvent];

  /**
   * Prints the image the event carries (every print event keeps it, printed or failed; the
   * history is cleaned by retention and on logout). The user follows it in one notice, the
   * one the page opened with "Preparando impresión":
   * 1. Without the image (an event stored by an older version, with only a marker) nothing
   *    is printed and the notice says so.
   * 2. The notice turns into "Imprimiendo" while the printer connects and prints.
   * 3. Printed: it turns into "Impreso" and fades.
   * 4. Not printed: it turns into the reason, with a way to the failed prints and to the
   *    printer.
   * Final: a failure throws, so the event lands in the failed queue with its image, ready to
   * preview and retry.
   */
  async process(event: PrintImageRequestedEvent): Promise<void> {
    const key = printNoticeKey(event.jobId || event.uuid);
    const image = event.imageBase64;
    if (!image || image.startsWith("[omitido")) {
      notifyDevice({
        key,
        name: "printer.image_missing",
        title: "No se imprimió",
        message: "La imagen de esta impresión ya no está guardada.",
        variant: "danger",
      });
      throw new DomainValidationError("No se pudo imprimir");
    }
    notifyDevice({
      key,
      name: "printer.printing",
      title: "Imprimiendo",
      message: event.title || "Enviando a la impresora…",
      variant: "loading",
    });
    const printed = await printerService.printImageBase64(image).catch((error: unknown) => {
      logger.error("Print failed before reaching the printer", errorAttributes(error));
      return false;
    });
    if (printed) {
      notifyDevice({
        key,
        name: "printer.printed",
        title: "Impreso",
        message: event.title || "La impresión salió",
        variant: "success",
      });
      return;
    }
    notifyDevice({
      key,
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
