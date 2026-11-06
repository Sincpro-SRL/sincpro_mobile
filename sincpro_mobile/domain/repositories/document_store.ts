import { type IntegrationEvent } from "@sincpro/mobile/domain/events/integration_event";

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
  read(uuid: string): Promise<DocumentRow | null>;
  readSync?(uuid: string): DocumentRow | null;
  insert(row: DocumentRow): Promise<void>;
  update(row: DocumentRow, expectedVersion: number): Promise<boolean>;
  upsert(row: DocumentRow): Promise<void>;
  remove(uuid: string): Promise<void>;
  list(): Promise<DocumentRow[]>;
  hasColumn(name: string): boolean;
  selectBy(column: string, value: ColumnValue): Promise<DocumentRow[]>;
  selectBySync?(column: string, value: ColumnValue): DocumentRow[];
  inTransaction(): boolean;
  transaction<T>(work: () => Promise<T>): Promise<T>;
}

export interface Outbox {
  save(event: IntegrationEvent): Promise<void>;
  schedule(): void;
}
