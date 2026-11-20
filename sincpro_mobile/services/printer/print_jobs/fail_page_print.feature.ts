import { Command } from "@sincpro/client-framework";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";
import {
  captureFailedNotice,
  printNoticeKey,
  UNTRACKED_PAGE_JOB,
} from "@sincpro/mobile/services/printer/print_jobs/common";

export class CommandFailPagePrint extends Command<void> {
  constructor(
    readonly title: string,
    readonly reason: string,
    readonly jobId: string = UNTRACKED_PAGE_JOB,
  ) {
    super();
  }
}

/**
 * The page's capture failed before reaching the printer — it said so, or it never answered.
 * Recording it is this run's work; the span and the log line say why the print did not come
 * out, and the person reads it in the job's notice.
 * 1. The person is told first.
 * Final: the pages of a print of N that arrived before the failure are forgotten — nothing of
 *    it prints, and the person prints it again from the page.
 */
@commonBoundedContext.feature(CommandFailPagePrint)
export class FailPagePrint extends Feature<CommandFailPagePrint, void> {
  async execute(command: CommandFailPagePrint): Promise<void> {
    this.span.set({ "print.job_id": command.jobId, "print.failure": command.reason });
    this.logger.warn("Page print capture failed", {
      jobId: command.jobId,
      reason: command.reason,
    });
    this.notifier.notify(captureFailedNotice(printNoticeKey(command.jobId), command.title));
    await this.printJobs.remove(command.jobId);
  }
}
