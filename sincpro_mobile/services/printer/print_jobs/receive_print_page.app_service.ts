import { Command } from "@sincpro/client-framework";
import type { PrintPage } from "@sincpro/mobile/domain/print/print_job";
import {
  ApplicationService,
  commonBoundedContext,
} from "@sincpro/mobile/infrastructure/framework";
import { firstScopeOf } from "@sincpro/mobile/services/printer/print_jobs/common";
import { CommandOfferPrintJob } from "@sincpro/mobile/services/printer/print_jobs/offer_print_job.feature";
import { CommandPrintJobPages } from "@sincpro/mobile/services/printer/print_jobs/print_job_pages.feature";
import { CommandStorePrintPage } from "@sincpro/mobile/services/printer/print_jobs/store_print_page.feature";

export class CommandReceivePrintPage extends Command<void> {
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
 * A page of a print of N pages arrived from where it was captured — a WebView's page:
 * 1. It is kept (`CommandStorePrintPage`).
 * Final: when it was the last to arrive, the job starts as the app prints N pages
 *    (`printer.policy.pages`): every page or the first one goes to the printer
 *    (`CommandPrintJobPages`), or the person chooses (`CommandOfferPrintJob`).
 */
@commonBoundedContext.appService(CommandReceivePrintPage)
export class ReceivePrintPage extends ApplicationService<CommandReceivePrintPage, void> {
  async execute(command: CommandReceivePrintPage): Promise<void> {
    const ready = await this.featureBus.execute(
      new CommandStorePrintPage(
        command.jobId,
        command.title,
        command.page,
        command.pages,
        command.content,
      ),
    );
    if (!ready) return;
    const scope = firstScopeOf(this.printer.policy.pages);
    if (scope) {
      await this.featureBus.execute(new CommandPrintJobPages(command.jobId, scope));
    } else {
      await this.featureBus.execute(new CommandOfferPrintJob(command.jobId));
    }
  }
}
