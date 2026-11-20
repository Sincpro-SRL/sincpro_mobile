import { Command } from "@sincpro/client-framework";
import { PrintImageRequestedEvent } from "@sincpro/mobile/domain/print/events";
import { EPrintJobScope, type PrintJob } from "@sincpro/mobile/domain/print/print_job";
import { DomainValidationError } from "@sincpro/mobile/exceptions";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";
import {
  pagesInScope,
  pageTitleOf,
  printFailedNotice,
  printNoticeKey,
} from "@sincpro/mobile/services/printer/print_jobs/common";

export class CommandPrintJobPages extends Command<void> {
  constructor(
    readonly jobId: string,
    readonly scope: EPrintJobScope = EPrintJobScope.NEXT,
  ) {
    super();
  }
}

/**
 * Sends pages of a job to the printer — the next one, or all that are left —, each queued on
 * its own (`PrintImageRequestedEvent`): each is retried alone and shows alone among the failed
 * prints, so a page that failed never prints the others again.
 * 1. A job that no longer waits (finished, cancelled) prints nothing: it fails `invalid`.
 * 2. The job moves past those pages before they are queued: a page asked twice at once goes
 *    once, and the second ask fails `invalid`.
 * 3. Each page is queued in order, named by its place («Tickets · 3 de 10»), under the job's
 *    notice.
 * 4. A page that could not be queued puts the job back on that page, shown to the person to
 *    ask again; the failure keeps its kind.
 * Final: a job with pages left is shown where it is, with the page that prints next; the last
 *    page forgets the job and closes it.
 */
@commonBoundedContext.feature(CommandPrintJobPages)
export class PrintJobPages extends Feature<CommandPrintJobPages, void> {
  async execute(command: CommandPrintJobPages): Promise<void> {
    const job = await this.waitingJob(command.jobId);
    const { from, to } = pagesInScope(job, command.scope);
    this.span.set({ "print.job_id": job.id, "print.from": from, "print.to": to });
    if (!(await this.printJobs.advance(job.id, job.printed, to))) {
      throw new DomainValidationError("The print job already moved past those pages");
    }
    await this.queue(job, from, to);
    if (to === job.total) {
      await this.printJobs.remove(job.id);
      this.printJobPrompt.close(job.id);
      return;
    }
    await this.show({ ...job, printed: to });
  }

  private async waitingJob(jobId: string): Promise<PrintJob> {
    const job = await this.printJobs.find(jobId);
    if (!job || job.printed >= job.total) {
      throw new DomainValidationError("The print job no longer waits");
    }
    return job;
  }

  private async queue(job: PrintJob, from: number, to: number): Promise<void> {
    const pages = await this.printJobs.pages(job.id, from, to);
    let queued = 0;
    try {
      for (const page of pages) {
        const event = Object.assign(new PrintImageRequestedEvent(), {
          imageBase64: page.image,
          width: page.width,
          height: page.height,
          title: pageTitleOf(job.title, from + queued, job.total),
          jobId: job.id,
        });
        await this.publisher.publish(event);
        queued += 1;
      }
    } catch (error) {
      const printed = from - 1 + queued;
      await this.printJobs.advance(job.id, to, printed);
      await this.show({ ...job, printed });
      this.notifier.notify(printFailedNotice(printNoticeKey(job.id), job.title, error));
      throw error;
    }
  }

  private async show(job: PrintJob): Promise<void> {
    const [next] = await this.printJobs.pages(job.id, job.printed + 1, job.printed + 1);
    this.printJobPrompt.show({ job, next: next ?? null });
  }
}
