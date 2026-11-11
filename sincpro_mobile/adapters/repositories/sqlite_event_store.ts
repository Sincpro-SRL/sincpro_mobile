import type {
  DeliveryFailure,
  EventStore,
  JsonValue,
  StoredEvent,
  StoredState,
} from "@sincpro/client-framework";
import { type EventRecord, labelOf, textOf } from "@sincpro/mobile/domain/events";
import { ECommonRepository } from "@sincpro/mobile/domain/repositories/catalog";
import { DATABASE_TABLES } from "@sincpro/mobile/entrypoints/db/migrations";
import { DBCursor } from "@sincpro/mobile/infrastructure/database";

type EventRow = {
  id: string;
  name: string;
  correlation_id: string;
  causation_id: string | null;
  published_at: string;
  payload: string;
  state: string;
  attempts: number;
  retry_at: string | null;
  reached: string;
  failures: string;
  settled_at: string | null;
};

const COLUMNS =
  "id, name, correlation_id, causation_id, published_at, payload, state, attempts, retry_at, reached, failures, settled_at";

function parsed<T>(text: string | null, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

/**
 * The stored queue's `EventStore` on a phone: one SQLite table, `stored_events`, in the order
 * the events were added (`seq`) — and what the screens read of it.
 *
 * Context: storing is this adapter's, deciding is the queue's (`storedQueue`): `add` keeps an
 * event waiting, `next` finds the oldest still waiting, `save` writes how its delivery went.
 * `add` runs on the connection of the transaction that is open, when one is (`DBCursor`): a
 * repository stores what its aggregates recorded inside its own transaction, so the event is
 * kept exactly when the aggregate is — and asks for the delivery only after the commit. The
 * set-aside events are the failed ones a person retries.
 */
export class SqliteEventStore implements EventStore {
  readonly name = ECommonRepository.STORED_EVENTS;
  readonly table = DATABASE_TABLES.STORED_EVENTS;
  private classOf: (name: string) => object | undefined = () => undefined;

  /** How a event's name is read as its class: its label on the screens. */
  useCatalog(classOf: (name: string) => object | undefined): void {
    this.classOf = classOf;
  }

  async add(stored: StoredEvent): Promise<void> {
    await DBCursor.mutateDatabase(
      `INSERT OR IGNORE INTO ${this.table} (${COLUMNS}) VALUES (${placeholders(12)})`,
      stored.envelope.id,
      stored.envelope.name,
      stored.envelope.correlationId,
      stored.envelope.causationId,
      stored.envelope.publishedAt,
      JSON.stringify(stored.payload),
      stored.state,
      stored.attempts,
      stored.retryAt,
      JSON.stringify(stored.reached),
      JSON.stringify(stored.failures),
      stored.state === "pending" ? null : new Date().toISOString(),
    );
  }

  async next(skip: ReadonlySet<string>): Promise<StoredEvent | undefined> {
    const skipped = [...skip];
    const row = await DBCursor.getFirstAsync<EventRow>(
      `SELECT ${COLUMNS} FROM ${this.table}
       WHERE state = 'pending'${skipped.length > 0 ? ` AND id NOT IN (${placeholders(skipped.length)})` : ""}
       ORDER BY seq ASC
       LIMIT 1`,
      ...skipped,
    );
    return row ? this.stored(row) : undefined;
  }

  async save(stored: StoredEvent): Promise<void> {
    await DBCursor.mutateDatabase(
      `UPDATE ${this.table}
       SET state = ?, attempts = ?, retry_at = ?, reached = ?, failures = ?, settled_at = ?
       WHERE id = ?`,
      stored.state,
      stored.attempts,
      stored.retryAt,
      JSON.stringify(stored.reached),
      JSON.stringify(stored.failures),
      stored.state === "pending" ? null : new Date().toISOString(),
      stored.envelope.id,
    );
  }

  /** Newest first, bounded in SQL so a list never loads the whole history. */
  async recent(limit: number): Promise<EventRecord[]> {
    const rows = await DBCursor.getAllAsync<EventRow>(
      `SELECT ${COLUMNS} FROM ${this.table} ORDER BY seq DESC LIMIT ?`,
      limit,
    );
    return rows.map((row) => this.record(row));
  }

  /** Every event in `state`, newest first. */
  async inState(state: StoredState): Promise<EventRecord[]> {
    const rows = await DBCursor.getAllAsync<EventRow>(
      `SELECT ${COLUMNS} FROM ${this.table} WHERE state = ? ORDER BY seq DESC`,
      state,
    );
    return rows.map((row) => this.record(row));
  }

  async byIds(ids: readonly string[]): Promise<EventRecord[]> {
    if (ids.length === 0) return [];
    const rows = await DBCursor.getAllAsync<EventRow>(
      `SELECT ${COLUMNS} FROM ${this.table} WHERE id IN (${placeholders(ids.length)}) ORDER BY seq ASC`,
      ...ids,
    );
    return rows.map((row) => this.record(row));
  }

  /** What an entity's `events` reads (`@mapped`). */
  findByIdsSync(ids: readonly string[]): EventRecord[] {
    if (ids.length === 0) return [];
    const rows = DBCursor.getAllSync<EventRow>(
      `SELECT ${COLUMNS} FROM ${this.table} WHERE id IN (${placeholders(ids.length)}) ORDER BY seq ASC`,
      ...ids,
    );
    return rows.map((row) => this.record(row));
  }

  findByIdSync(id: string): EventRecord | undefined {
    return this.findByIdsSync([id])[0];
  }

  /**
   * Sends set-aside events back to wait, once per failure: only those still set aside move — a
   * second retry of the same failure (a double tap) finds nothing —, with their attempts from
   * zero and the parties that failed no longer counted as reached. Answers how many moved.
   */
  async retry(ids: readonly string[]): Promise<number> {
    let moved = 0;
    for (const record of await this.byIds(ids)) {
      if (record.state !== "set_aside") continue;
      const failed = new Set(record.failures.map((failure) => failure.boundedContext));
      const row = await DBCursor.getFirstAsync<{ reached: string }>(
        `SELECT reached FROM ${this.table} WHERE id = ?`,
        record.id,
      );
      const reached = parsed<string[]>(row?.reached ?? null, []).filter(
        (party) => !failed.has(party),
      );
      const result = await DBCursor.mutateDatabase(
        `UPDATE ${this.table}
         SET state = 'pending', attempts = 0, retry_at = NULL, failures = '[]', reached = ?,
             settled_at = NULL
         WHERE id = ? AND state = 'set_aside'`,
        JSON.stringify(reached),
        record.id,
      );
      moved += result.changes;
    }
    return moved;
  }

  async remove(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await DBCursor.mutateDatabase(
      `DELETE FROM ${this.table} WHERE id IN (${placeholders(ids.length)})`,
      ...ids,
    );
  }

  /** Retention: delivered events published before `cutoff` (ISO) are history, not work. */
  async pruneDeliveredBefore(cutoff: string): Promise<void> {
    await DBCursor.mutateDatabase(
      `DELETE FROM ${this.table} WHERE state = 'delivered' AND published_at < ?`,
      cutoff,
    );
  }

  async clear(): Promise<void> {
    await DBCursor.mutateDatabase(`DELETE FROM ${this.table}`);
  }

  async count(state?: StoredState): Promise<number> {
    const row = state
      ? await DBCursor.getFirstAsync<{ count: number }>(
          `SELECT COUNT(*) AS count FROM ${this.table} WHERE state = ?`,
          state,
        )
      : await DBCursor.getFirstAsync<{ count: number }>(
          `SELECT COUNT(*) AS count FROM ${this.table}`,
        );
    return row?.count ?? 0;
  }

  private stored(row: EventRow): StoredEvent {
    return {
      envelope: {
        name: row.name,
        id: row.id,
        correlationId: row.correlation_id,
        causationId: row.causation_id,
        publishedAt: row.published_at,
      },
      payload: parsed<JsonValue>(row.payload, {}),
      state: row.state as StoredState,
      attempts: row.attempts,
      retryAt: row.retry_at,
      reached: parsed<string[]>(row.reached, []),
      failures: parsed<DeliveryFailure[]>(row.failures, []),
    };
  }

  private record(row: EventRow): EventRecord {
    const failures = parsed<DeliveryFailure[]>(row.failures, []);
    return {
      id: row.id,
      name: row.name,
      label: textOf(labelOf(this.classOf(row.name), row.name)),
      state: row.state as StoredState,
      attempts: row.attempts,
      publishedAt: row.published_at,
      settledAt: row.settled_at,
      correlationId: row.correlation_id,
      causationId: row.causation_id,
      failures,
      error:
        failures.length > 0 ? failures.map((failure) => failure.message).join("; ") : null,
      payload: parsed<JsonValue>(row.payload, {}),
    };
  }
}

export const eventStore = new SqliteEventStore();
