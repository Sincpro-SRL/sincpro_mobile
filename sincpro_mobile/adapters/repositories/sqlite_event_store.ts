import type {
  DeliveryFailure,
  JsonValue,
  MessageKind,
  MessageStore,
  StoredMessage,
  StoredState,
} from "@sincpro/client-framework";
import {
  conditionsOf,
  type Criteria,
  type Expression,
  InvalidCriteria,
  type Page,
  type Value,
} from "@sincpro/criteria";
import {
  type CompiledCriteria,
  compilePage,
  countCeiling,
  countOf,
  countStatement,
  type CriteriaSqlTarget,
  cursorAfter,
  selectStatement,
  type SqlParam,
} from "@sincpro/mobile/domain/database/criteria_sql";
import { type EventRecord, labelOf, textOf } from "@sincpro/mobile/domain/events";
import { ECommonRepository } from "@sincpro/mobile/domain/repositories/catalog";
import { DATABASE_TABLES } from "@sincpro/mobile/entrypoints/db/migrations";
import { DBCursor } from "@sincpro/mobile/infrastructure/database";

type EventRow = {
  id: string;
  kind: string;
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
  answer: string | null;
  label: string | null;
  label_key: string | null;
};

const COLUMNS =
  "id, kind, name, correlation_id, causation_id, published_at, payload, state, attempts, retry_at, reached, failures, settled_at, answer, label, label_key";

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
 * What a criteria over the stored events reads: each field by the name `EventRecord` gives it,
 * and the column that holds it. `labelKey` is the label as a person searches it — a condition
 * on `label` reads it.
 */
const EVENT_COLUMNS: Readonly<Record<string, string>> = {
  seq: "seq",
  id: "id",
  kind: "kind",
  name: "name",
  label: "label",
  labelKey: "label_key",
  state: "state",
  attempts: "attempts",
  publishedAt: "published_at",
  settledAt: "settled_at",
  correlationId: "correlation_id",
  causationId: "causation_id",
};

/** The alias of the view a search reads: the table, its columns named as `EventRecord`'s. */
const EVENTS = "events";

const EVENTS_TARGET: CriteriaSqlTarget = {
  table: EVENTS,
  column: (field) => field in EVENT_COLUMNS,
};

type ViewRow = EventRow & Record<string, SqlParam>;

/** Text as a person searches it: lower case, without accents. */
function searchable(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function searchableValue(value: Value): Value {
  if (typeof value === "string") return searchable(value);
  if (Array.isArray(value)) return value.map((one) => searchableValue(one) as never);
  return value;
}

/** The filter with every condition on `label` reading its key: without accents or case. */
function keyed(expression: Expression): Expression {
  if ("all" in expression) return { all: expression.all.map(keyed) };
  if ("any" in expression) return { any: expression.any.map(keyed) };
  if ("negate" in expression) return { negate: keyed(expression.negate) };
  if (!("field" in expression) || expression.field !== "label") return expression;
  return { ...expression, field: "labelKey", value: searchableValue(expression.value) };
}

function assertEventFields(criteria: Criteria): void {
  const fields = [
    ...conditionsOf(criteria.selection).map((condition) => condition.field),
    ...(criteria.order ?? []).map((sort) => sort.field),
  ];
  const unknown = fields.find((field) => !(field in EVENT_COLUMNS));
  if (unknown !== undefined) {
    throw new InvalidCriteria(`events are not read by '${unknown}'`);
  }
}

/** The table as a search reads it: its columns under the names `EventRecord` gives them. */
function viewOf(table: string): string {
  const named = Object.entries(EVENT_COLUMNS)
    .filter(([field, column]) => field !== column)
    .map(([field, column]) => `${column} AS ${field}`);
  return `(SELECT ${COLUMNS}, seq, ${named.join(", ")} FROM ${table}) AS ${EVENTS}`;
}

/**
 * The stored queue's `MessageStore` on a phone: one SQLite table, `stored_events`, in the order
 * the events were added (`seq`) — and what the screens read of it.
 *
 * Context: storing is this adapter's, deciding is the queue's (`storedQueue`): `add` keeps an
 * event waiting, `next` finds the oldest still waiting, `save` writes how its delivery went.
 * `add` runs on the connection of the transaction that is open, when one is (`DBCursor`): a
 * repository stores what its aggregates recorded inside its own transaction, so the event is
 * kept exactly when the aggregate is — and asks for the delivery only after the commit. The
 * set-aside events are the failed ones a person retries.
 */
export class SqliteEventStore implements MessageStore {
  readonly name = ECommonRepository.STORED_EVENTS;
  readonly table = DATABASE_TABLES.STORED_EVENTS;
  private classOf: (name: string) => object | undefined = () => undefined;

  /** How a event's name is read as its class: its label on the screens. */
  useCatalog(classOf: (name: string) => object | undefined): void {
    this.classOf = classOf;
  }

  /** Keeps a message waiting, with the label its class gives it then: what the screens show. */
  async add(stored: StoredMessage): Promise<void> {
    const label = this.labelOf(stored.envelope.name);
    await DBCursor.mutateDatabase(
      `INSERT OR IGNORE INTO ${this.table} (${COLUMNS}) VALUES (${placeholders(16)})`,
      stored.envelope.id,
      stored.kind,
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
      stored.answer === null ? null : JSON.stringify(stored.answer),
      label,
      searchable(label),
    );
  }

  async next(skip: ReadonlySet<string>): Promise<StoredMessage | undefined> {
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

  async save(stored: StoredMessage): Promise<void> {
    await DBCursor.mutateDatabase(
      `UPDATE ${this.table}
       SET state = ?, attempts = ?, retry_at = ?, reached = ?, failures = ?, settled_at = ?,
           answer = ?
       WHERE id = ?`,
      stored.state,
      stored.attempts,
      stored.retryAt,
      JSON.stringify(stored.reached),
      JSON.stringify(stored.failures),
      stored.state === "pending" ? null : new Date().toISOString(),
      stored.answer === null ? null : JSON.stringify(stored.answer),
      stored.envelope.id,
    );
  }

  /**
   * The page of stored events a criteria asks — what the event screens read, never the whole
   * history:
   * 1. A condition on `label` reads the label kept with the event, without accents or case.
   * 2. Every field is a column, named as `EventRecord` names it (`EVENT_COLUMNS`); another is
   *    refused.
   * 3. Newest first (`seq`) unless the criteria orders it; fifty unless it says; past its cursor.
   * Final: the page, the next page's cursor and the count its `count` asks.
   */
  async search(asked: Criteria<EventRecord> = {}): Promise<Page<EventRecord>> {
    const selection = asked.selection as Expression | undefined;
    const criteria: Criteria = {
      ...(asked as Criteria),
      selection: selection && keyed(selection),
    };
    assertEventFields(criteria);
    const page = compilePage(criteria, EVENTS_TARGET, {
      order: [{ field: "seq", descending: true }],
      identity: "seq",
    });
    const { sql, params } = selectStatement(page.rows, viewOf(this.table));
    const rows = await DBCursor.getAllAsync<ViewRow>(sql, ...params);
    const shown = rows.slice(0, page.limit);
    const last = shown.at(-1);
    return {
      rows: shown.map((row) => this.record(row)),
      cursor:
        rows.length > page.limit && page.resumable && last
          ? cursorAfter({ uuid: "", version: 0, data: "{}", columns: last }, page)
          : null,
      count:
        page.count === "none"
          ? null
          : countOf(await this.counted(page.filter, page.count), page.count),
      meta: null,
      dropped: [],
    };
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

  /** Retention of the failed ones: those set aside before `cutoff` (ISO), from when they failed. */
  async pruneFailedBefore(cutoff: string): Promise<void> {
    await DBCursor.mutateDatabase(
      `DELETE FROM ${this.table}
       WHERE state = 'set_aside' AND COALESCE(settled_at, published_at) < ?`,
      cutoff,
    );
  }

  /** Empties every event in `states`, whatever its age; answers how many went. */
  async clearIn(states: readonly StoredState[]): Promise<number> {
    if (states.length === 0) return 0;
    const result = await DBCursor.mutateDatabase(
      `DELETE FROM ${this.table} WHERE state IN (${placeholders(states.length)})`,
      ...states,
    );
    return result.changes;
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

  private async counted(filter: CompiledCriteria, mode: "capped" | "exact"): Promise<number> {
    const { sql, params } = countStatement(filter, viewOf(this.table), countCeiling(mode));
    const row = await DBCursor.getFirstAsync<{ total: number }>(sql, ...params);
    return Number(row?.total ?? 0);
  }

  private labelOf(name: string): string {
    return textOf(labelOf(this.classOf(name), name));
  }

  private stored(row: EventRow): StoredMessage {
    return {
      kind: row.kind as MessageKind,
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
      answer: parsed<JsonValue | null>(row.answer, null),
    };
  }

  private record(row: EventRow): EventRecord {
    const failures = parsed<DeliveryFailure[]>(row.failures, []);
    return {
      id: row.id,
      kind: row.kind as MessageKind,
      name: row.name,
      label: row.label ?? this.labelOf(row.name),
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
      answer: parsed<JsonValue | null>(row.answer, null),
    };
  }
}

export const eventStore = new SqliteEventStore();
