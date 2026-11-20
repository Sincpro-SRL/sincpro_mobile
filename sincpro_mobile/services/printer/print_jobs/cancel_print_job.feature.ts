import { Command } from "@sincpro/client-framework";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";
import {
  jobCancelledNotice,
  printNoticeKey,
} from "@sincpro/mobile/services/printer/print_jobs/common";

export class CommandCancelPrintJob extends Command<void> {
  constructor(readonly jobId: string) {
    super();
  }
}

/**
 * The person stops a job: the pages left are not printed. What already went to the printer
 * stays in the queue.
 * 1. A job that no longer waits changes nothing.
 * 2. The job and its pages are forgotten, and it is no longer shown.
 * Final: the job's notice says how many pages came out.
 */
@commonBoundedContext.feature(CommandCancelPrintJob)
export class CancelPrintJob extends Feature<CommandCancelPrintJob, void> {
  async execute(command: CommandCancelPrintJob): Promise<void> {
    const job = await this.printJobs.find(command.jobId);
    this.span.set({ "print.job_id": command.jobId, "print.printed": job?.printed ?? 0 });
    if (!job) return;
    await this.printJobs.remove(job.id);
    this.printJobPrompt.close(job.id);
    this.notifier.notify(jobCancelledNotice(printNoticeKey(job.id), job));
  }
}
