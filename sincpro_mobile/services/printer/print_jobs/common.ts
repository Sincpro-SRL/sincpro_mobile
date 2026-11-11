import type { Notice, Notifier } from "@sincpro/mobile/domain/notifier";
import {
  PRINT_FAILURE_ACTIONS,
  PRINT_NOTICE_ACTIONS,
  whyNotPrinted,
} from "@sincpro/mobile/services/printer/common";

/** A page that sent no job id: its steps still share one notice. */
export const UNTRACKED_PAGE_JOB = "page";

/**
 * A print the person follows in one notice (`key`):
 * 1. It turns into "Imprimiendo" while the printer connects and prints.
 * 2. Printed: it turns into "Impreso".
 * Final: not printed, it says why — with a way to the failed prints and to the printer — and
 *    the failure is thrown as it came, so the run keeps its kind.
 */
export async function printFollowed(
  notifier: Notifier,
  job: { key: string; title: string },
  print: () => Promise<void>,
): Promise<void> {
  notifier.notify({
    key: job.key,
    name: "printer.printing",
    title: "Imprimiendo",
    message: job.title || "Enviando a la impresora…",
    variant: "loading",
  });
  try {
    await print();
  } catch (error) {
    notifier.notify({
      key: job.key,
      name: "printer.print_failed",
      title: "No se imprimió",
      message: whyNotPrinted(error, job.title),
      variant: "danger",
      actions: PRINT_FAILURE_ACTIONS,
    });
    throw error;
  }
  notifier.notify({
    key: job.key,
    name: "printer.printed",
    title: "Impreso",
    message: job.title || "La impresión salió",
    variant: "success",
  });
}

/** The notice of a page's print that never reached the printer. */
export function captureFailed(key: string, title: string): Notice {
  return {
    key,
    name: "printer.capture_failed",
    title: "No se pudo preparar la impresión",
    message: title
      ? `«${title}»: vuelve a intentarlo desde la página.`
      : "Vuelve a intentarlo desde la página.",
    variant: "danger",
    actions: [PRINT_NOTICE_ACTIONS.printer],
  };
}
