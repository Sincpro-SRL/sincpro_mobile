import { Command } from "@sincpro/client-framework";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";
import {
  printNoticeKey,
  UNTRACKED_PAGE_JOB,
} from "@sincpro/mobile/services/printer/print_jobs/common";

export class CommandStartPagePrint extends Command<void> {
  constructor(
    readonly title: string,
    readonly jobId: string = UNTRACKED_PAGE_JOB,
  ) {
    super();
  }
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
