import type { Notice } from "@sincpro/mobile/domain/notifier";
import {
  PRINT_FAILURE_ACTIONS,
  PRINT_NOTICE_ACTIONS,
  whyNotPrinted,
} from "@sincpro/mobile/services/printer/common";

/**
 * What the print jobs' use cases share: the notices of one job, built from what it is — never
 * sent from here. Each use case notifies, prints and publishes with its own dependencies.
 */

/** A page that sent no job id: its steps still share one notice. */
export const UNTRACKED_PAGE_JOB = "page";

/** The notice of one print job: preparing, printing and the result share it. */
export function printNoticeKey(jobId: string): string {
  return `print:${jobId}`;
}

/** The job's notice while the printer connects and prints. */
export function printingNotice(key: string, title: string): Notice {
  return {
    key,
    name: "printer.printing",
    title: "Imprimiendo",
    message: title || "Enviando a la impresora…",
    variant: "loading",
  };
}

/** The job's notice once it came out. */
export function printedNotice(key: string, title: string): Notice {
  return {
    key,
    name: "printer.printed",
    title: "Impreso",
    message: title || "La impresión salió",
    variant: "success",
  };
}

/**
 * The job's notice when it did not come out: why, by the failure's kind, with a way to the
 * failed prints and to the printer.
 */
export function printFailedNotice(key: string, title: string, error: unknown): Notice {
  return {
    key,
    name: "printer.print_failed",
    title: "No se imprimió",
    message: whyNotPrinted(error, title),
    variant: "danger",
    actions: PRINT_FAILURE_ACTIONS,
  };
}

/** The notice of a page's print that never reached the printer. */
export function captureFailedNotice(key: string, title: string): Notice {
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
