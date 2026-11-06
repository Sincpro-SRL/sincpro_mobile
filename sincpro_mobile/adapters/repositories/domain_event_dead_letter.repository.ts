import { type IntegrationEvent } from "@sincpro/mobile/domain/events";
import { ECommonRepository } from "@sincpro/mobile/domain/repositories";
import { DATABASE_TABLES } from "@sincpro/mobile/entrypoints/db/migrations";
import { DBCursor } from "@sincpro/mobile/infrastructure/database";
import { loggerRepositories } from "@sincpro/mobile/infrastructure/logger";

import { type EventRow, readEvent } from "./event_row";

const STORED_COLUMNS =
  "data, attempts, error_message, failed_at, source_id, sequence, requires_network, 'FAILED' as status";

class DomainEventDeadLetterRepositoryImpl {
  public readonly name = ECommonRepository.DOMAIN_EVENT_DEAD_LETTER;
  public readonly table = DATABASE_TABLES.DOMAIN_EVENTS_DEAD_LETTER;

  async save(event: IntegrationEvent, errorMessage?: string): Promise<void> {
    await DBCursor.mutateDatabase(
      `INSERT INTO ${this.table} 
       (uuid, name, label, data, requires_network, created_at, attempts, error_message, failed_at, aggregate_id, source_id, correlation_id, sequence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      event.uuid,
      event.name,
      event.label,
      event.asJSON(),
      event.requiresNetwork ? 1 : 0,
      event.createdAt,
      event.attempts,
      errorMessage || event.errorMessage,
      new Date().toISOString(),
      event.aggregateId,
      event.sourceId,
      event.correlationId,
      event.sequence,
    );

    loggerRepositories.debug(
      `DomainEvent moved to dead letter: ${event.name} [${event.uuid}]`,
    );
  }

  async findById(uuid: string): Promise<IntegrationEvent | null> {
    const row = await DBCursor.getFirstAsync<EventRow>(
      `SELECT ${STORED_COLUMNS} FROM ${this.table} WHERE uuid = ?`,
      uuid,
    );
    return row ? readEvent(row) : null;
  }

  async findAll(): Promise<IntegrationEvent[]> {
    const rows = await DBCursor.getAllAsync<EventRow>(
      `SELECT ${STORED_COLUMNS} FROM ${this.table} ORDER BY failed_at DESC`,
    );
    return rows.map((row) => readEvent(row));
  }

  async findByName(name: string): Promise<IntegrationEvent[]> {
    const rows = await DBCursor.getAllAsync<EventRow>(
      `SELECT ${STORED_COLUMNS} FROM ${this.table}
       WHERE name = ?
       ORDER BY failed_at DESC`,
      name,
    );
    return rows.map((row) => readEvent(row));
  }

  async findByCorrelationId(correlationId: string): Promise<IntegrationEvent[]> {
    const rows = await DBCursor.getAllAsync<EventRow>(
      `SELECT ${STORED_COLUMNS} FROM ${this.table}
       WHERE correlation_id = ?
       ORDER BY sequence ASC`,
      correlationId,
    );
    return rows.map((row) => readEvent(row));
  }

  async findByAggregateId(aggregateId: string): Promise<IntegrationEvent[]> {
    const rows = await DBCursor.getAllAsync<EventRow>(
      `SELECT ${STORED_COLUMNS} FROM ${this.table}
       WHERE aggregate_id = ?
       ORDER BY failed_at DESC`,
      aggregateId,
    );
    return rows.map((row) => readEvent(row));
  }

  async findRecent(limit: number = 50): Promise<IntegrationEvent[]> {
    const rows = await DBCursor.getAllAsync<EventRow>(
      `SELECT ${STORED_COLUMNS} FROM ${this.table}
       ORDER BY failed_at DESC
       LIMIT ?`,
      limit,
    );
    return rows.map((row) => readEvent(row));
  }

  async remove(uuid: string): Promise<void> {
    await DBCursor.mutateDatabase(`DELETE FROM ${this.table} WHERE uuid = ?`, uuid);
    loggerRepositories.debug(`Dead letter removed: ${uuid}`);
  }

  async removeByCorrelationId(correlationId: string): Promise<void> {
    await DBCursor.mutateDatabase(
      `DELETE FROM ${this.table} WHERE correlation_id = ?`,
      correlationId,
    );
  }

  async clearAll(): Promise<void> {
    await DBCursor.mutateDatabase(`DELETE FROM ${this.table}`);
    loggerRepositories.info("Dead letter table cleared");
  }

  async retry(uuid: string): Promise<IntegrationEvent | null> {
    const event = await this.findById(uuid);
    if (!event) return null;

    await this.remove(uuid);
    event.retry();

    return event;
  }

  async retryByCorrelationId(correlationId: string): Promise<IntegrationEvent[]> {
    const events = await this.findByCorrelationId(correlationId);
    if (events.length === 0) return [];

    await this.removeByCorrelationId(correlationId);

    return events.map((event) => event.retry());
  }

  async count(): Promise<number> {
    const result = await DBCursor.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.table}`,
    );
    return result?.count || 0;
  }

  async countByName(name: string): Promise<number> {
    const result = await DBCursor.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.table} WHERE name = ?`,
      name,
    );
    return result?.count || 0;
  }
}

export const DomainEventDeadLetterRepository = new DomainEventDeadLetterRepositoryImpl();
