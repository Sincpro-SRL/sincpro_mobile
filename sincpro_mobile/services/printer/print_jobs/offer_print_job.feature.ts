import { Command } from "@sincpro/client-framework";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";
import {
  jobReadyNotice,
  printNoticeKey,
} from "@sincpro/mobile/services/printer/print_jobs/common";

export class CommandOfferPrintJob extends Command<void> {
  constructor(readonly jobId: string) {
    super();
  }
}

/**
 * Puts a ready job in front of the person, who chooses: every page at once, or one at a time.
 * 1. A job that no longer waits is not shown.
 * 2. It is shown with the page that prints next.
 * Final: the job's notice says it is ready — it said «Preparando impresión» while its pages
 *    came.
 */
@commonBoundedContext.feature(CommandOfferPrintJob)
export class OfferPrintJob extends Feature<CommandOfferPrintJob, void> {
  async execute(command: CommandOfferPrintJob): Promise<void> {
    const job = await this.printJobs.find(command.jobId);
    this.span.set({ "print.job_id": command.jobId, "print.pages": job?.total ?? 0 });
    if (!job) return;
    const [next] = await this.printJobs.pages(job.id, job.printed + 1, job.printed + 1);
    this.printJobPrompt.show({ job, next: next ?? null });
    this.notifier.notify(jobReadyNotice(printNoticeKey(job.id), job));
  }
}
