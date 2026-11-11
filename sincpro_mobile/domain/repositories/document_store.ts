import type { StoredEvent } from "@sincpro/client-framework";
import { type CompiledCriteria } from "@sincpro/mobile/domain/database/criteria_sql";

export enum StoreMode {
  LOCAL = "local",
  RELAY = "relay",
}

export type ColumnValue = string | number | null;

export interface DocumentRow {
  uuid: string;
  version: number;
  data: string;
  columns: Record<string, ColumnValue>;
}

export interface DocumentStore {
  readonly table: string;
  read(uuid: string): Promise<DocumentRow | null>;
  readSync?(uuid: string): DocumentRow | null;
  insert(row: DocumentRow): Promise<void>;
  update(row: DocumentRow, expectedVersion: number): Promise<boolean>;
  upsert(row: DocumentRow): Promise<void>;
  remove(uuid: string): Promise<void>;
  list(): Promise<DocumentRow[]>;
  selectMatching(compiled: CompiledCriteria): Promise<DocumentRow[]>;
  hasColumn(name: string): boolean;
  selectBy(column: string, value: ColumnValue): Promise<DocumentRow[]>;
  selectBySync?(column: string, value: ColumnValue): DocumentRow[];
  inTransaction(): boolean;
  transaction<T>(work: () => Promise<T>): Promise<T>;
}

/**
 * Where a repository leaves what its aggregates recorded: `save` keeps one stored event inside
 * the repository's own transaction; `schedule`, after the commit, asks for its delivery.
 */
export interface Outbox {
  save(stored: StoredEvent): Promise<void>;
  schedule(): void;
}
