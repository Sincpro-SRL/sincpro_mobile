import { DomainEvent, EEventStatus } from "@sincpro/mobile/domain/event_sourcing";
import { ECommonRepository } from "@sincpro/mobile/domain/repositories";
import { DATABASE_TABLES } from "@sincpro/mobile/entrypoints/db/migrations";
import { DBCursor } from "@sincpro/mobile/infrastructure/database";
import { loggerRepositories } from "@sincpro/mobile/infrastructure/logger";

class DomainEventRepositoryImpl {
  public readonly name = ECommonRepository.DOMAIN_EVENT;
  public readonly table = DATABASE_TABLES.DOMAIN_EVENTS;

  private async hasPendingDuplicate(event: DomainEvent): Promise<boolean> {
    if (event.correlationId) {
      const existing = await DBCursor.getFirstAsync<{ uuid: string }>(
        `SELECT uuid FROM ${this.table} 
         WHERE name = ? AND correlation_id = ? AND status = ?
         LIMIT 1`,
        event.name,
        event.correlationId,
        EEventStatus.PENDING,
      );
      return existing !== null;
    }

    const existing = await DBCursor.getFirstAsync<{ uuid: string }>(
      `SELECT uuid FROM ${this.table} 
       WHERE name = ? AND status = ? AND correlation_id IS NULL
       LIMIT 1`,
      event.name,
      EEventStatus.PENDING,
    );
    return existing !== null;
  }

  async save(event: DomainEvent): Promise<void> {
    if (event.isPending) {
      const isDuplicate = await this.hasPendingDuplicate(event);
      if (isDuplicate) {
        loggerRepositories.warn(`DomainEvent duplicated, skipping: ${event.name}`);
        return;
      }
    }

    await DBCursor.mutateDatabase(
      `INSERT OR REPLACE INTO ${this.table} 
       (uuid, name, label, data, requires_network, created_at, status, attempts, error_message, acknowledged_at, failed_at, aggregate_id, source_id, correlation_id, sequence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      event.uuid,
      event.name,
      event.label,
      event.asJSON(),
      event.requiresNetwork ? 1 : 0,
      event.createdAt,
      event.status,
      event.attempts,
      event.errorMessage,
      event.acknowledgedAt,
      event.failedAt,
      event.aggregateId,
      event.sourceId,
      event.correlationId,
      event.sequence,
    );

    loggerRepositories.debug(`DomainEvent saved: ${event.name} [${event.uuid}]`);
  }

  async saveMany(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.save(event);
    }
  }

  async findById(uuid: string): Promise<DomainEvent | null> {
    const row = await DBCursor.getFirstAsync<{ data: string }>(
      `SELECT data FROM ${this.table} WHERE uuid = ?`,
      uuid,
    );
    return row ? DomainEvent.fromJSON(row.data) : null;
  }

  async findByIds(uuids: string[]): Promise<DomainEvent[]> {
    if (uuids.length === 0) return [];

    const placeholders = uuids.map(() => "?").join(",");
    const rows = await DBCursor.getAllAsync<{ data: string }>(
      `SELECT data FROM ${this.table} WHERE uuid IN (${placeholders}) ORDER BY sequence ASC`,
      ...uuids,
    );
    return rows.map((row) => DomainEvent.fromJSON(row.data));
  }

  async findNextPending(internetConnected: boolean): Promise<DomainEvent | null> {
    let row: { uuid: string; data: string } | null;

    if (internetConnected) {
      row = await DBCursor.getFirstAsync<{ uuid: string; data: string }>(
        `SELECT uuid, data FROM ${this.table}
         WHERE status = ?
         ORDER BY created_at ASC
         LIMIT 1`,
        EEventStatus.PENDING,
      );
    } else {
      row = await DBCursor.getFirstAsync<{ uuid: string; data: string }>(
        `SELECT uuid, data FROM ${this.table}
         WHERE status = ? AND requires_network = 0
         ORDER BY created_at ASC
         LIMIT 1`,
        EEventStatus.PENDING,
      );
    }

    if (!row) return null;

    return DomainEvent.fromJSON<DomainEvent>(row.data);
  }

  async findByStatus(status: EEventStatus): Promise<DomainEvent[]> {
    const rows = await DBCursor.getAllAsync<{ data: string }>(
      `SELECT data FROM ${this.table}
       WHERE status = ?
       ORDER BY created_at ASC`,
      status,
    );
    return rows.map((row) => DomainEvent.fromJSON(row.data));
  }

  async findByStatuses(statuses: EEventStatus[]): Promise<DomainEvent[]> {
    const placeholders = statuses.map(() => "?").join(",");
    const rows = await DBCursor.getAllAsync<{ data: string }>(
      `SELECT data FROM ${this.table}
       WHERE status IN (${placeholders})
       ORDER BY created_at DESC`,
      ...statuses,
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
       ORDER BY created_at ASC`,
      aggregateId,
    );
    return rows.map((row) => DomainEvent.fromJSON(row.data));
  }

  async findByName(name: string): Promise<DomainEvent[]> {
    const rows = await DBCursor.getAllAsync<{ data: string }>(
      `SELECT data FROM ${this.table}
       WHERE name = ?
       ORDER BY created_at ASC`,
      name,
    );
    return rows.map((row) => DomainEvent.fromJSON(row.data));
  }

  async findPending(): Promise<DomainEvent[]> {
    return this.findByStatus(EEventStatus.PENDING);
  }

  async findFailed(): Promise<DomainEvent[]> {
    return this.findByStatus(EEventStatus.FAILED);
  }

  async remove(uuid: string): Promise<void> {
    await DBCursor.mutateDatabase(`DELETE FROM ${this.table} WHERE uuid = ?`, uuid);
  }

  async removeByCorrelationId(correlationId: string): Promise<void> {
    await DBCursor.mutateDatabase(
      `DELETE FROM ${this.table} WHERE correlation_id = ?`,
      correlationId,
    );
  }

  async removeAcknowledged(): Promise<void> {
    await DBCursor.mutateDatabase(
      `DELETE FROM ${this.table} WHERE status = ?`,
      EEventStatus.ACKNOWLEDGED,
    );
  }

  async clearAll(): Promise<void> {
    await DBCursor.mutateDatabase(`DELETE FROM ${this.table}`);
    loggerRepositories.info("DomainEvent table cleared");
  }

  async count(): Promise<number> {
    const result = await DBCursor.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.table}`,
    );
    return result?.count || 0;
  }

  async countByStatus(status: EEventStatus): Promise<number> {
    const result = await DBCursor.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.table} WHERE status = ?`,
      status,
    );
    return result?.count || 0;
  }

  findByIdSync(uuid: string): DomainEvent | null {
    const row = DBCursor.getFirstSync<{ data: string }>(
      `SELECT data FROM ${this.table} WHERE uuid = ?`,
      uuid,
    );
    return row ? DomainEvent.fromJSON(row.data) : null;
  }

  findByIdsSync(uuids: string[]): DomainEvent[] {
    if (uuids.length === 0) return [];
    const placeholder = uuids.map(() => "?").join(",");
    const rows = DBCursor.getAllSync<{ data: string }>(
      `SELECT data FROM ${this.table} WHERE uuid IN (${placeholder}) ORDER BY created_at ASC`,
      ...uuids,
    );
    return rows.map((row) => DomainEvent.fromJSON(row.data));
  }

  findByRemoteIdSync(remoteId: number | string): DomainEvent | null {
    // DomainEvents don't have remote IDs, return null
    loggerRepositories.warn(
      `findByRemoteIdSync called on DomainEventRepository: ${remoteId} - DomainEvents don't have remote IDs`,
    );
    return null;
  }

  findByRemoteIdsSync(remoteIds: (number | string)[]): DomainEvent[] {
    // DomainEvents don't have remote IDs, return empty array
    loggerRepositories.warn(
      `findByRemoteIdsSync called on DomainEventRepository with ${remoteIds.length} ids - DomainEvents don't have remote IDs`,
    );
    return [];
  }
}

export const DomainEventRepository = new DomainEventRepositoryImpl();
