import { type IntegrationEvent } from "@sincpro/mobile/domain/events/integration_event";

export enum StoreMode {
  LOCAL = "local",
  RELAY = "relay",
}

export type ColumnValue = string | number | null;

export interface DocumentRow {
  uuid: string;
  data: string;
  columns: Record<string, ColumnValue>;
}

export interface DocumentStore {
  read(uuid: string): Promise<DocumentRow | null>;
  write(row: DocumentRow): Promise<void>;
  remove(uuid: string): Promise<void>;
  list(): Promise<DocumentRow[]>;
  transaction<T>(work: () => Promise<T>): Promise<T>;
}

export interface Outbox {
  save(event: IntegrationEvent): Promise<void>;
  schedule(): void;
}
