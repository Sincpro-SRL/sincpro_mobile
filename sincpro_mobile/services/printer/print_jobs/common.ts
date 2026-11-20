import type { Notice } from "@sincpro/mobile/domain/notifier";
import {
  EPrintJobScope,
  EPrintPages,
  type PrintJob,
} from "@sincpro/mobile/domain/print/print_job";
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

/**
 * What prints at once when every page of a job arrived, by how the app prints N pages: all of
 * them, the first one, or nothing — `null`, the person chooses.
 */
export function firstScopeOf(mode: EPrintPages): EPrintJobScope | null {
  if (mode === EPrintPages.ALL) return EPrintJobScope.REST;
  if (mode === EPrintPages.STEP) return EPrintJobScope.NEXT;
  return null;
}

/**
 * The pages a scope takes from where the job is, counted from 1 and both included: the next
 * one, or from the next one to the last.
 */
export function pagesInScope(
  job: PrintJob,
  scope: EPrintJobScope,
): { from: number; to: number } {
  const from = job.printed + 1;
  return { from, to: scope === EPrintJobScope.NEXT ? from : job.total };
}

/** How a page of a job is named in its notice and among the failed prints: «Tickets · 3 de 10». */
export function pageTitleOf(title: string, page: number, total: number): string {
  const place = `${page} de ${total}`;
  return title ? `${title} · ${place}` : `Página ${place}`;
}

/** The job's notice once every page arrived and the person chooses how to print them. */
export function jobReadyNotice(key: string, job: PrintJob): Notice {
  return {
    key,
    name: "printer.job_ready",
    title: "Listo para imprimir",
    message: `${job.title || "Impresión"}: ${job.total} páginas`,
    variant: "info",
  };
}

/** The job's notice when the person stopped it: how many pages came out. */
export function jobCancelledNotice(key: string, job: PrintJob): Notice {
  return {
    key,
    name: "printer.job_cancelled",
    title: "Impresión cancelada",
    message: `${job.title || "Impresión"}: ${job.printed} de ${job.total} páginas impresas`,
    variant: "warning",
  };
}
