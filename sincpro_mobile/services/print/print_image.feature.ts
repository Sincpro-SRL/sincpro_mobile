import { Command, newEntityId } from "@sincpro/client-framework";
import { printNoticeKey } from "@sincpro/mobile/domain/webview/print_cycle";
import { DomainValidationError, PrinterNotSelected } from "@sincpro/mobile/exceptions";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

export class CommandPrintImage extends Command<void> {
  constructor(
    readonly imageBase64: string,
    readonly title: string,
    /** The notice the person follows: the page's print, or the message that asked for it. */
    readonly jobId: string = "",
  ) {
    super();
  }
}

/** What the person reads when a print did not come out. */
function whyNotPrinted(error: unknown, title: string): string {
  if (error instanceof PrinterNotSelected) return "Selecciona una impresora primero.";
  return title
    ? `«${title}»: revisa que la impresora esté encendida y cerca.`
    : "Revisa que la impresora esté encendida y cerca.";
}

/**
 * Prints an image the person follows in one notice — the one the page opened with "Preparando
 * impresión" —, executed by a screen or by the queue's handler of `PrintImageRequestedEvent`:
 * 1. The notice is the one the Command names; else one of its own.
 * 2. Without the image (a request stored by an older version, with only a marker) nothing is
 *    printed, the notice says so, and it fails `invalid`: retrying it unchanged prints nothing,
 *    so the queue sets it aside.
 * 3. The notice turns into "Imprimiendo" while the printer connects and prints.
 * 4. Printed: it turns into "Impreso".
 * Final: not printed, the notice says why — with a way to the failed prints and to the printer —
 *    and the failure keeps its kind: a printer off or out of reach is `unavailable`, retried by
 *    the queue; none chosen is `domain`, set aside until the person retries it.
 */
@commonBoundedContext.feature(CommandPrintImage)
export class PrintImage extends Feature<CommandPrintImage, void> {
  async execute(request: CommandPrintImage): Promise<void> {
    const key = printNoticeKey(request.jobId || newEntityId());
    const image = request.imageBase64;
    if (!image || image.startsWith("[omitido")) {
      this.notifier.notify({
        key,
        name: "printer.image_missing",
        title: "No se imprimió",
        message: "La imagen de esta impresión ya no está guardada.",
        variant: "danger",
      });
      throw new DomainValidationError("The print request has no image");
    }
    this.notifier.notify({
      key,
      name: "printer.printing",
      title: "Imprimiendo",
      message: request.title || "Enviando a la impresora…",
      variant: "loading",
    });
    try {
      await this.printer.printImage(image);
    } catch (error) {
      this.notifier.notify({
        key,
        name: "printer.print_failed",
        title: "No se imprimió",
        message: whyNotPrinted(error, request.title),
        variant: "danger",
        actions: this.printer.printFailureActions(),
      });
      throw error;
    }
    this.notifier.notify({
      key,
      name: "printer.printed",
      title: "Impreso",
      message: request.title || "La impresión salió",
      variant: "success",
    });
  }
}
