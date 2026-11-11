import { Command, newEntityId } from "@sincpro/client-framework";
import { printNoticeKey } from "@sincpro/mobile/domain/webview/print_cycle";
import { DomainValidationError } from "@sincpro/mobile/exceptions";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";
import { printFollowed } from "@sincpro/mobile/services/print/notices";

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

/**
 * Prints an image the person follows in one notice — the one the page opened with "Preparando
 * impresión" —, executed by a screen or by the queue's handler of `PrintImageRequestedEvent`:
 * 1. The notice is the one the Command names; else one of its own.
 * 2. Without the image (a request stored by an older version, with only a marker) nothing is
 *    printed, the notice says so, and it fails `invalid`: retrying it unchanged prints nothing,
 *    so the queue sets it aside.
 * 3. The notice follows the print (`printFollowed`): "Imprimiendo", then "Impreso".
 * Final: not printed, the notice says why — with a way to the failed prints and to the printer —
 *    and the failure keeps its kind: a printer off or out of reach is `unavailable`, retried by
 *    the queue; none chosen is `domain`, set aside until the person retries it.
 */
@commonBoundedContext.feature(CommandPrintImage)
export class PrintImage extends Feature<CommandPrintImage, void> {
  async execute(request: CommandPrintImage): Promise<void> {
    const key = printNoticeKey(request.jobId || newEntityId());
    this.span.set({ "print.job_id": request.jobId, "print.title": request.title });
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
    await printFollowed(this.notifier, { key, title: request.title }, () =>
      this.printer.printImage(image),
    );
  }
}
