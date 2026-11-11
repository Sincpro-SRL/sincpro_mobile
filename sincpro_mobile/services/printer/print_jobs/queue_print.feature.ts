import { Command } from "@sincpro/client-framework";
import { PrintImageRequestedEvent } from "@sincpro/mobile/domain/print/events";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";
import {
  captureFailedNotice,
  printNoticeKey,
} from "@sincpro/mobile/services/printer/print_jobs/common";

export class CommandQueuePrint extends Command<void> {
  constructor(
    readonly imageBase64: string,
    readonly width: number,
    readonly height: number,
    readonly title: string,
    /** The notice the person already follows (a page's print); empty starts its own. */
    readonly jobId: string = "",
  ) {
    super();
  }
}

/**
 * Queues an image to print: the queue stores it first, so a print survives a closed app and a
 * printer off, and `PrintImageRequestedEvent` reaches the print use case in this run's flow and
 * trace (the publisher is bound to the run).
 * 1. The job is the page's; without one, this run's id.
 * 2. The image travels in the event and stays in its history: retention and logout clean it.
 * Final: it could not be queued — the job's notice says so, and the failure keeps its kind.
 */
@commonBoundedContext.feature(CommandQueuePrint)
export class QueuePrint extends Feature<CommandQueuePrint, void> {
  async execute(command: CommandQueuePrint): Promise<void> {
    const jobId = command.jobId || this.execution.id;
    this.span.set({ "print.job_id": jobId, "print.title": command.title });
    const event = Object.assign(new PrintImageRequestedEvent(), {
      imageBase64: command.imageBase64,
      width: command.width,
      height: command.height,
      title: command.title,
      jobId,
    });
    try {
      await this.publisher.publish(event);
    } catch (error) {
      this.notifier.notify(captureFailedNotice(printNoticeKey(jobId), command.title));
      throw error;
    }
  }
}
