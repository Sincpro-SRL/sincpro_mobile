import { IntegrationEvent } from "@sincpro/mobile/domain/events";
import { ECommonRepository, repos } from "@sincpro/mobile/entrypoints/db";
import { replaceable } from "@sincpro/mobile/framework/replaceable";
import { loggerUseCases } from "@sincpro/mobile/infrastructure/logger";
import { EventBus } from "@sincpro/mobile/infrastructure/workers/EventBus";

export class DeadLetterQueueUseCases {
  private get repository() {
    return repos.get(ECommonRepository.DOMAIN_EVENT_DEAD_LETTER);
  }
  /**
   * Retrieves all failed events from the dead letter queue.
   */
  async getFailedEvents(): Promise<IntegrationEvent[]> {
    loggerUseCases.info("Fetching all failed events from dead letter queue");
    const deadLetterEvents = await this.repository.findAll();
    return deadLetterEvents;
  }

  /**
   * Retrieves a specific failed event by uuid.
   */
  async getFailedEventById(uuid: string): Promise<IntegrationEvent | null> {
    loggerUseCases.info(`Fetching failed event with uuid: ${uuid}`);
    return await this.repository.findById(uuid);
  }

  /**
   * Manually retries a failed event by re-queuing it for processing.
   * This removes the event from the dead letter queue and adds it back to the processing queue.
   */
  async retryFailedEvent(event: IntegrationEvent): Promise<void> {
    loggerUseCases.info(
      `Manually retrying failed event: ${event.name} (uuid: ${event.uuid})`,
    );

    try {
      event.retry();
      await EventBus.publish(event);

      // Remove from dead letter queue only after successful re-queuing
      await this.repository.remove(event.uuid);
      loggerUseCases.info(`Successfully retried event: ${event.name} (uuid: ${event.uuid})`);
    } catch (error) {
      loggerUseCases.error(
        `Failed to retry event ${event.name} (uuid: ${event.uuid}):`,
        error,
      );
      throw new Error(
        `Failed to retry event: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Retries multiple failed events in batch.
   */
  async retryMultipleFailedEvents(
    events: IntegrationEvent[],
  ): Promise<{ success: number; failed: number }> {
    loggerUseCases.info(`Batch retrying ${events.length} failed events`);

    let successCount = 0;
    let failedCount = 0;

    for (const event of events) {
      try {
        await this.retryFailedEvent(event);
        successCount++;
      } catch (error) {
        loggerUseCases.error(
          `Failed to retry event ${event.name} (uuid: ${event.uuid}):`,
          error,
        );
        failedCount++;
      }
    }

    loggerUseCases.info(
      `Batch retry completed: ${successCount} successful, ${failedCount} failed`,
    );
    return { success: successCount, failed: failedCount };
  }

  /**
   * Permanently deletes a failed event from the dead letter queue.
   * Use with caution as this action cannot be undone.
   */
  async deleteFailedEvent(event: IntegrationEvent): Promise<void> {
    loggerUseCases.info(
      `Permanently deleting failed event: ${event.name} (uuid: ${event.uuid})`,
    );

    try {
      await this.repository.remove(event.uuid);
      loggerUseCases.info(`Successfully deleted event: ${event.name} (uuid: ${event.uuid})`);
    } catch (error) {
      loggerUseCases.error(
        `Failed to delete event ${event.name} (uuid: ${event.uuid}):`,
        error,
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
    loggerUseCases.info(`Batch deleting ${events.length} failed events`);

    let successCount = 0;
    let failedCount = 0;

    for (const event of events) {
      try {
        await this.deleteFailedEvent(event);
        successCount++;
      } catch (error) {
        loggerUseCases.error(
          `Failed to delete event ${event.name} (uuid: ${event.uuid}):`,
          error,
        );
        failedCount++;
      }
    }

    loggerUseCases.info(
      `Batch delete completed: ${successCount} successful, ${failedCount} failed`,
    );
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
