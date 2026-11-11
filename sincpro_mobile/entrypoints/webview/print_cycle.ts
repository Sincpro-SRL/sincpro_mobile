import { EWebViewMessageType, type TWebViewMessage } from "@sincpro/mobile/domain/webview";
import { routePrintMessage } from "@sincpro/mobile/domain/webview/print_cycle";
import { commonBoundedContext } from "@sincpro/mobile/infrastructure/framework";
import type {
  WebViewMessage,
  WebViewMessageHandler,
} from "@sincpro/mobile/infrastructure/webview/message_handlers";
import { PagePrintWatch } from "@sincpro/mobile/infrastructure/webview/page_print_watch";
import { UNTRACKED_PAGE_JOB } from "@sincpro/mobile/services/printer/print_jobs/common";
import { CommandFailPagePrint } from "@sincpro/mobile/services/printer/print_jobs/fail_page_print.feature";
import { CommandQueuePrint } from "@sincpro/mobile/services/printer/print_jobs/queue_print.feature";
import { CommandStartPagePrint } from "@sincpro/mobile/services/printer/print_jobs/start_page_print.feature";

/**
 * The print cycle of a page with the print interceptor — the door a page prints through: each
 * message becomes a Command of `commonBoundedContext`, so every step is a run with its span,
 * its log lines and, when unexpected, its report.
 * 1. PRINT_STARTED: `CommandStartPagePrint`, and the capture is watched.
 * 2. PRINT_FAILED: the watch settles; `CommandFailPagePrint`.
 * 3. PRINT_IMAGE: the watch settles; `CommandQueuePrint` — the queue prints it.
 * Final: a capture that never answers executes `CommandFailPagePrint` on time out. A page that
 *    sends no job id is followed under one (`UNTRACKED_PAGE_JOB`), so its image settles its
 *    watch.
 */
export function printCycleHandlers(
  watch: PagePrintWatch = new PagePrintWatch(),
): Record<string, WebViewMessageHandler> {
  const printCycle = (message: WebViewMessage) =>
    routePrintMessage(message as unknown as TWebViewMessage, {
      started: async (title, jobId = UNTRACKED_PAGE_JOB) => {
        watch.start(jobId, () => {
          // The failure is recorded by its run; nobody waits for this one.
          commonBoundedContext
            .execute(new CommandFailPagePrint(title, "the capture did not answer", jobId))
            .catch(() => undefined);
        });
        await commonBoundedContext.execute(new CommandStartPagePrint(title, jobId));
      },
      failed: async (title, reason, jobId = UNTRACKED_PAGE_JOB) => {
        watch.settle(jobId);
        await commonBoundedContext.execute(new CommandFailPagePrint(title, reason, jobId));
      },
      image: async ({ imageBase64, width, height, title, jobId = UNTRACKED_PAGE_JOB }) => {
        watch.settle(jobId);
        await commonBoundedContext.execute(
          new CommandQueuePrint(imageBase64, width, height, title, jobId),
        );
      },
    }).then(() => undefined);
  return {
    [EWebViewMessageType.PRINT_STARTED]: printCycle,
    [EWebViewMessageType.PRINT_FAILED]: printCycle,
    [EWebViewMessageType.PRINT_IMAGE]: printCycle,
  };
}
