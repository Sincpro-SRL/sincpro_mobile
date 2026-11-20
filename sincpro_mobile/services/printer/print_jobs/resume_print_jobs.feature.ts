import { Command } from "@sincpro/client-framework";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

/** Answers how many jobs came back to the person. */
export class CommandResumePrintJobs extends Command<number> {}

/**
 * The jobs a person left waiting when the app closed come back to them:
 * 1. A job whose pages never all arrived is forgotten: its capture ended with the app.
 * 2. Each ready job is shown again where it was, with the page that prints next.
 * Final: how many came back.
 */
@commonBoundedContext.feature(CommandResumePrintJobs)
export class ResumePrintJobs extends Feature<CommandResumePrintJobs, number> {
  async execute(): Promise<number> {
    const discarded = await this.printJobs.discardArriving();
    const jobs = await this.printJobs.ready();
    for (const job of jobs) {
      const [next] = await this.printJobs.pages(job.id, job.printed + 1, job.printed + 1);
      this.printJobPrompt.show({ job, next: next ?? null });
    }
    this.span.set({ "print.jobs": jobs.length, "print.discarded": discarded });
    if (jobs.length > 0 || discarded > 0) {
      this.logger.info("Print jobs resumed", { resumed: jobs.length, discarded });
    }
    return jobs.length;
  }
}
