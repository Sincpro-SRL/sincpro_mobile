import { logger } from "@sincpro/client-framework";
import { IntegrationEvent } from "@sincpro/mobile/domain/events";
import { ECommonRepository, repos } from "@sincpro/mobile/entrypoints/db";
import { replaceable } from "@sincpro/mobile/framework/replaceable";
import { errorAttributes } from "@sincpro/mobile/infrastructure/logger";
import { EventBus } from "@sincpro/mobile/infrastructure/workers/EventBus";

export class DeadLetterQueueUseCases {
  private get repository() {
    return repos.get(ECommonRepository.DOMAIN_EVENT_DEAD_LETTER);
  }
  /**
   * Retrieves all failed events from the dead letter queue.
   */
  async getFailedEvents(): Promise<IntegrationEvent[]> {
    logger.info("Fetching all failed events from dead letter queue");
    const deadLetterEvents = await this.repository.findAll();
    return deadLetterEvents;
  }

  /**
   * Retrieves a specific failed event by uuid.
   */
  async getFailedEventById(uuid: string): Promise<IntegrationEvent | null> {
    logger.info(`Fetching failed event with uuid: ${uuid}`);
    return await this.repository.findById(uuid);
  }

  /**
   * Sends a failed event back to the queue, once per failure.
   *
   * 1. Take the event out of the dead letter queue first: a second retry of the same failure
   *    (a double tap, a list that was not refreshed) finds nothing and returns false, so a
   *    side effect such as a print never runs twice.
   * 2. Publish it again. If it fails again the bus puts it back, ready for another retry.
   * Final. If publishing throws, the event goes back to the dead letter queue.
   */
  async retryFailedEvent(event: IntegrationEvent): Promise<boolean> {
    logger.info(`Manually retrying failed event: ${event.name} (uuid: ${event.uuid})`);

    if (!(await this.repository.remove(event.uuid))) {
      logger.warn(
        `Retry skipped: ${event.name} (uuid: ${event.uuid}) is no longer in the dead letter queue`,
      );
      return false;
    }

    try {
      event.retry();
      await EventBus.publish(event);
      logger.info(`Successfully retried event: ${event.name} (uuid: ${event.uuid})`);
      return true;
    } catch (error) {
      logger.error(
        `Failed to retry event ${event.name} (uuid: ${event.uuid})`,
        errorAttributes(error),
      );
      const reason = error instanceof Error ? error.message : String(error);
      await this.repository.save(event, reason);
      throw new Error(`Failed to retry event: ${reason}`);
    }
  }

  /**
   * Retries multiple failed events in batch.
   */
  async retryMultipleFailedEvents(
    events: IntegrationEvent[],
  ): Promise<{ success: number; failed: number }> {
    logger.info(`Batch retrying ${events.length} failed events`);

    let successCount = 0;
    let failedCount = 0;

    for (const event of events) {
      try {
        if (await this.retryFailedEvent(event)) successCount++;
        else failedCount++;
      } catch (error) {
        logger.error(
          `Failed to retry event ${event.name} (uuid: ${event.uuid})`,
          errorAttributes(error),
        );
        failedCount++;
      }
    }

    logger.info(`Batch retry completed: ${successCount} successful, ${failedCount} failed`);
    return { success: successCount, failed: failedCount };
  }

  /**
   * Permanently deletes a failed event from the dead letter queue.
   * Use with caution as this action cannot be undone.
   */
  async deleteFailedEvent(event: IntegrationEvent): Promise<void> {
    logger.info(`Permanently deleting failed event: ${event.name} (uuid: ${event.uuid})`);

    try {
      await this.repository.remove(event.uuid);
      logger.info(`Successfully deleted event: ${event.name} (uuid: ${event.uuid})`);
    } catch (error) {
      logger.error(
        `Failed to delete event ${event.name} (uuid: ${event.uuid})`,
        errorAttributes(error),
      );
      throw new Error(
        `Failed to delete event: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Deletes multiple failed events in batch.
   */
  async deleteMultipleFailedEvents(
    events: IntegrationEvent[],
  ): Promise<{ success: number; failed: number }> {
    logger.info(`Batch deleting ${events.length} failed events`);

    let successCount = 0;
    let failedCount = 0;

    for (const event of events) {
      try {
        await this.deleteFailedEvent(event);
        successCount++;
      } catch (error) {
        logger.error(
          `Failed to delete event ${event.name} (uuid: ${event.uuid})`,
          errorAttributes(error),
        );
        failedCount++;
      }
    }

    logger.info(`Batch delete completed: ${successCount} successful, ${failedCount} failed`);
    return { success: successCount, failed: failedCount };
  }
}

const deadLetterQueueUseCasesSlot = replaceable(new DeadLetterQueueUseCases());

/** Swaps the implementation for a subclass, for the whole app and the core. */
export function setDeadLetterQueueUseCases(service: DeadLetterQueueUseCases): void {
  deadLetterQueueUseCasesSlot.set(service);
}

export const deadLetterQueueUseCases: DeadLetterQueueUseCases =
  deadLetterQueueUseCasesSlot.instance;
