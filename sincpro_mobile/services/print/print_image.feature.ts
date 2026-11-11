import { Command, Feature } from "@sincpro/client-framework";
import { printNoticeKey } from "@sincpro/mobile/domain/webview/print_cycle";
import { DomainValidationError } from "@sincpro/mobile/exceptions";
import { errorAttributes } from "@sincpro/mobile/infrastructure/logger";
import { notifyDevice } from "@sincpro/mobile/infrastructure/ui/activity";
import type { PrinterService } from "@sincpro/mobile/services/printer.service";

export class CommandPrintImage extends Command<void> {
  constructor(
    readonly imageBase64: string,
    readonly title: string,
    /** The notice the user follows: the page's print, or the request's own id. */
    readonly jobId: string,
  ) {
    super();
  }
}

/**
 * Prints an image the user is following in one notice, the one the page opened with
 * "Preparando impresión":
 * 1. Without the image (a request stored by an older version, with only a marker) nothing is
 *    printed and the notice says so.
 * 2. The notice turns into "Imprimiendo" while the printer connects and prints.
 * 3. Printed: it turns into "Impreso" and fades.
 * 4. Not printed: it turns into the reason, with a way to the failed prints and to the printer.
 * Final: a failure is `invalid` — retrying it unchanged prints nothing —, so the request is set
 * aside with its image, ready to preview and retry from the failed prints.
 */
export class PrintImage extends Feature<CommandPrintImage, void> {
  static readonly serviceName = "PrintImage";
  declare readonly printer: PrinterService;

  async execute(command: CommandPrintImage): Promise<void> {
    const key = printNoticeKey(command.jobId);
    const image = command.imageBase64;
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
      message: command.title || "Enviando a la impresora…",
      variant: "loading",
    });
    const printed = await this.printer.printImageBase64(image).catch((error: unknown) => {
      this.logger.error("Print failed before reaching the printer", errorAttributes(error));
      return false;
    });
    if (printed) {
      notifyDevice({
        key,
        name: "printer.printed",
        title: "Impreso",
        message: command.title || "La impresión salió",
        variant: "success",
      });
      return;
    }
    notifyDevice({
      key,
      name: "printer.print_failed",
      title: "No se imprimió",
      message: command.title
        ? `«${command.title}»: revisa que la impresora esté encendida y cerca.`
        : "Revisa que la impresora esté encendida y cerca.",
      variant: "danger",
      actions: this.printer.printFailureActions(),
    });
    throw new DomainValidationError("No se pudo imprimir");
  }
}
