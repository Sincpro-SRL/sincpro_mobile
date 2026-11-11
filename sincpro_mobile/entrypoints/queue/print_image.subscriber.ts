import { type BoundedContext, EventSubscriber } from "@sincpro/client-framework";
import { PrintImageRequestedEvent } from "@sincpro/mobile/domain/events";
import type { CommonDependencies } from "@sincpro/mobile/infrastructure/bounded_context";
import { CommandPrintImage } from "@sincpro/mobile/services/print/print_image.feature";

export class PrintImageSubscriber extends EventSubscriber<PrintImageRequestedEvent> {
  static readonly subscriberName = "PrintImage";
  declare readonly commonBoundedContext: BoundedContext<CommonDependencies>;

  async handle(event: PrintImageRequestedEvent): Promise<void> {
    await this.commonBoundedContext.execute(
      new CommandPrintImage(
        event.imageBase64,
        event.title,
        event.jobId || this.execution.causationId || "",
      ),
    );
  }
}
