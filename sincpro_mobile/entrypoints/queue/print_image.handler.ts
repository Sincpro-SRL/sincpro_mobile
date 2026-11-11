import { PrintImageRequestedEvent } from "@sincpro/mobile/domain/print/events";
import { commonBoundedContext, EventHandler } from "@sincpro/mobile/infrastructure/framework";
import { CommandPrintImage } from "@sincpro/mobile/services/print/print_image.feature";

/**
 * A print the queue delivers: it executes the print use case. The notice is the page's print
 * job; a request stored without one is followed under its message's id — what only this
 * entrypoint knows, and what stays the same on every retry.
 */
@commonBoundedContext.handler([PrintImageRequestedEvent])
export class OnPrintImageRequested extends EventHandler<PrintImageRequestedEvent> {
  async handle(event: PrintImageRequestedEvent): Promise<void> {
    await this.boundedContext.execute(
      new CommandPrintImage(
        event.imageBase64,
        event.title,
        event.jobId || this.execution.causationId || "",
      ),
    );
  }
}
