import { Command, newEntityId } from "@sincpro/client-framework";
import type { PrintPage } from "@sincpro/mobile/domain/print/print_job";
import { DomainValidationError } from "@sincpro/mobile/exceptions";
import {
  ApplicationService,
  commonBoundedContext,
} from "@sincpro/mobile/infrastructure/framework";
import { firstScopeOf } from "@sincpro/mobile/services/printer/print_jobs/common";
import { CommandOfferPrintJob } from "@sincpro/mobile/services/printer/print_jobs/offer_print_job.feature";
import { CommandPrintJobPages } from "@sincpro/mobile/services/printer/print_jobs/print_job_pages.feature";
import { CommandQueuePrint } from "@sincpro/mobile/services/printer/print_jobs/queue_print.feature";
import { CommandStorePrintPage } from "@sincpro/mobile/services/printer/print_jobs/store_print_page.feature";

/** Answers the job's id, which its notice and the sheet follow. */
export class CommandOpenPrintJob extends Command<string> {
  constructor(
    readonly title: string,
    readonly pages: readonly PrintPage[],
  ) {
    super();
  }
}

/**
 * A print of N pages any code made — views it captured, a document's pages —, printed as the
 * app prints N pages, wherever the pages came from:
 * 1. With no page nothing prints: it fails `invalid`.
 * 2. One page is queued as any image is (`CommandQueuePrint`).
 * 3. Its pages are kept in order under a job of its own (`CommandStorePrintPage`).
 * Final: the job starts as the app prints N pages (`printer.policy.pages`): every page or the
 *    first one goes to the printer (`CommandPrintJobPages`), or the person chooses
 *    (`CommandOfferPrintJob`).
 */
@commonBoundedContext.appService(CommandOpenPrintJob)
export class OpenPrintJob extends ApplicationService<CommandOpenPrintJob, string> {
  async execute(command: CommandOpenPrintJob): Promise<string> {
    const jobId = newEntityId();
    const total = command.pages.length;
    this.span.set({ "print.job_id": jobId, "print.pages": total });
    if (total === 0) throw new DomainValidationError("A print job needs one page at least");
    if (total === 1) {
      const [page] = command.pages;
      await this.featureBus.execute(
        new CommandQueuePrint(page.image, page.width, page.height, command.title, jobId),
      );
      return jobId;
    }
    await this.keep(jobId, command);
    const scope = firstScopeOf(this.printer.policy.pages);
    if (scope) {
      await this.featureBus.execute(new CommandPrintJobPages(jobId, scope));
    } else {
      await this.featureBus.execute(new CommandOfferPrintJob(jobId));
    }
    return jobId;
  }

  private async keep(jobId: string, command: CommandOpenPrintJob): Promise<void> {
    const total = command.pages.length;
    for (const [index, page] of command.pages.entries()) {
      await this.featureBus.execute(
        new CommandStorePrintPage(jobId, command.title, index + 1, total, page),
      );
    }
  }
}
