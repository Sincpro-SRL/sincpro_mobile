import { Command } from "@sincpro/client-framework";
import type { PrintPage } from "@sincpro/mobile/domain/print/print_job";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

/** Answers whether this page made the job ready: every page arrived. */
export class CommandStorePrintPage extends Command<boolean> {
  constructor(
    readonly jobId: string,
    readonly title: string,
    /** Its place, counted from 1. */
    readonly page: number,
    /** How many pages the job has. */
    readonly pages: number,
    readonly content: PrintPage,
  ) {
    super();
  }
}

/**
 * Keeps one page of a print of N pages as it arrives:
 * 1. The page is kept on the device, and the job with its first page.
 * Final: whether this page made the job ready. Two pages arriving at once never both say so.
 */
@commonBoundedContext.feature(CommandStorePrintPage)
export class StorePrintPage extends Feature<CommandStorePrintPage, boolean> {
  async execute(command: CommandStorePrintPage): Promise<boolean> {
    this.span.set({
      "print.job_id": command.jobId,
      "print.page": command.page,
      "print.pages": command.pages,
    });
    await this.printJobs.addPage(
      { id: command.jobId, title: command.title, total: command.pages },
      command.page,
      command.content,
    );
    return this.printJobs.markReady(command.jobId);
  }
}
