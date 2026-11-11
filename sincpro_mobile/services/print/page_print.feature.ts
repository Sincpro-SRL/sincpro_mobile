import { Command } from "@sincpro/client-framework";
import { PrintImageRequestedEvent } from "@sincpro/mobile/domain/print/events";
import { printNoticeKey } from "@sincpro/mobile/domain/webview/print_cycle";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";
import { PRINT_NOTICE_ACTIONS } from "@sincpro/mobile/services/printer.service";

/** A page that sent no job id: its steps still share one notice. */
export const UNTRACKED_PAGE_JOB = "page";

export class CommandStartPagePrint extends Command<void> {
  constructor(
    readonly title: string,
    readonly jobId: string = UNTRACKED_PAGE_JOB,
  ) {
    super();
  }
}

export class CommandFailPagePrint extends Command<void> {
  constructor(
    readonly title: string,
    readonly reason: string,
    readonly jobId: string = UNTRACKED_PAGE_JOB,
  ) {
    super();
  }
}

export class CommandQueuePrint extends Command<void> {
  constructor(
    readonly imageBase64: string,
    readonly width: number,
    readonly height: number,
    readonly title: string,
    /** The notice the person already follows (a page's print); empty starts its own. */
    readonly jobId: string = "",
  ) {
    super();
  }
}

function captureFailed(title: string) {
  return {
    name: "printer.capture_failed",
    title: "No se pudo preparar la impresión",
    message: title
      ? `«${title}»: vuelve a intentarlo desde la página.`
      : "Vuelve a intentarlo desde la página.",
    variant: "danger",
    actions: [PRINT_NOTICE_ACTIONS.printer],
  } as const;
}

/**
 * A page started capturing what it prints. The capture can take seconds, so the person sees it
 * coming in the notice every later step of the job updates.
 */
@commonBoundedContext.feature(CommandStartPagePrint)
export class StartPagePrint extends Feature<CommandStartPagePrint, void> {
  async execute(command: CommandStartPagePrint): Promise<void> {
    this.span.set({ "print.job_id": command.jobId, "print.title": command.title });
    this.logger.info("Page print started", { jobId: command.jobId });
    this.notifier.notify({
      key: printNoticeKey(command.jobId),
      name: "printer.preparing",
      title: "Preparando impresión",
      message: command.title || "Capturando el documento…",
      variant: "loading",
    });
  }
}

/**
 * The page's capture failed before reaching the printer — it said so, or it never answered.
 * Recording it is this run's work, so it ends well; the span and the log line say why the
 * print did not come out, and the person reads it in the job's notice.
 */
@commonBoundedContext.feature(CommandFailPagePrint)
export class FailPagePrint extends Feature<CommandFailPagePrint, void> {
  async execute(command: CommandFailPagePrint): Promise<void> {
    this.span.set({ "print.job_id": command.jobId, "print.failure": command.reason });
    this.logger.warn("Page print capture failed", {
      jobId: command.jobId,
      reason: command.reason,
    });
    this.notifier.notify({
      key: printNoticeKey(command.jobId),
      ...captureFailed(command.title),
    });
  }
}

/**
 * Queues an image to print: the queue stores it first, so a print survives a closed app and a
 * printer off, and `PrintImageRequestedEvent` reaches the print use case in this run's flow and
 * trace (the publisher is bound to the run).
 * 1. The job is the page's; without one, this run's id.
 * 2. The image travels in the event and stays in its history: retention and logout clean it.
 * Final: it could not be queued — the job's notice says so, and the failure keeps its kind.
 */
@commonBoundedContext.feature(CommandQueuePrint)
export class QueuePrint extends Feature<CommandQueuePrint, void> {
  async execute(command: CommandQueuePrint): Promise<void> {
    const jobId = command.jobId || this.execution.id;
    this.span.set({ "print.job_id": jobId, "print.title": command.title });
    const event = Object.assign(new PrintImageRequestedEvent(), {
      imageBase64: command.imageBase64,
      width: command.width,
      height: command.height,
      title: command.title,
      jobId,
    });
    try {
      await this.publisher.publish(event);
    } catch (error) {
      this.notifier.notify({ key: printNoticeKey(jobId), ...captureFailed(command.title) });
      throw error;
    }
  }
}
