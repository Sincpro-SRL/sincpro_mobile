import { DomainEvent } from "../../domain/event";
import { ECommonRepository } from "../../domain/repository";
import { DATABASE_TABLES } from "../../entrypoints/db/migrations";
import { DBCursor } from "../../infrastructure/database";
import { loggerRepositories } from "../../infrastructure/logger";

class DomainEventDeadLetterRepositoryImpl {
  public readonly name = ECommonRepository.DOMAIN_EVENT_DEAD_LETTER;
  public readonly table = DATABASE_TABLES.DOMAIN_EVENTS_DEAD_LETTER;

  async save(event: DomainEvent, errorMessage?: string): Promise<void> {
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

  async findById(uuid: string): Promise<DomainEvent | null> {
    const row = await DBCursor.getFirstAsync<{ data: string }>(
      `SELECT data FROM ${this.table} WHERE uuid = ?`,
      uuid,
    );
    return row ? DomainEvent.fromJSON(row.data) : null;
  }

  async findAll(): Promise<DomainEvent[]> {
    const rows = await DBCursor.getAllAsync<{ data: string }>(
      `SELECT data FROM ${this.table} ORDER BY failed_at DESC`,
    );
    return rows.map((row) => DomainEvent.fromJSON(row.data));
  }

  async findByName(name: string): Promise<DomainEvent[]> {
    const rows = await DBCursor.getAllAsync<{ data: string }>(
      `SELECT data FROM ${this.table}
       WHERE name = ?
       ORDER BY failed_at DESC`,
      name,
    );
    return rows.map((row) => DomainEvent.fromJSON(row.data));
  }

  async findByCorrelationId(correlationId: string): Promise<DomainEvent[]> {
    const rows = await DBCursor.getAllAsync<{ data: string }>(
      `SELECT data FROM ${this.table}
       WHERE correlation_id = ?
       ORDER BY sequence ASC`,
      correlationId,
    );
    return rows.map((row) => DomainEvent.fromJSON(row.data));
  }

  async findByAggregateId(aggregateId: string): Promise<DomainEvent[]> {
    const rows = await DBCursor.getAllAsync<{ data: string }>(
      `SELECT data FROM ${this.table}
       WHERE aggregate_id = ?
       ORDER BY failed_at DESC`,
      aggregateId,
    );
    return rows.map((row) => DomainEvent.fromJSON(row.data));
  }

  async findRecent(limit: number = 50): Promise<DomainEvent[]> {
    const rows = await DBCursor.getAllAsync<{ data: string }>(
      `SELECT data FROM ${this.table}
       ORDER BY failed_at DESC
       LIMIT ?`,
      limit,
    );
    return rows.map((row) => DomainEvent.fromJSON(row.data));
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

  async retry(uuid: string): Promise<DomainEvent | null> {
    const event = await this.findById(uuid);
    if (!event) return null;

    await this.remove(uuid);
    event.retry();

    return event;
  }

  async retryByCorrelationId(correlationId: string): Promise<DomainEvent[]> {
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
