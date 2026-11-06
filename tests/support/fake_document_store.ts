import {
  type DocumentRow,
  type DocumentStore,
} from "../../sincpro_mobile/domain/repositories/document_store.ts";

export class FakeDocumentDatabase {
  private tables = new Map<string, Map<string, DocumentRow>>();
  private depth = 0;

  table(name: string): Map<string, DocumentRow> {
    let rows = this.tables.get(name);
    if (!rows) {
      rows = new Map();
      this.tables.set(name, rows);
    }
    return rows;
  }

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.depth > 0) return work();
    const backup = cloneTables(this.tables);
    this.depth += 1;
    try {
      return await work();
    } catch (error) {
      this.tables = backup;
      throw error;
    } finally {
      this.depth -= 1;
    }
  }
}

function cloneTables(
  tables: Map<string, Map<string, DocumentRow>>,
): Map<string, Map<string, DocumentRow>> {
  const copy = new Map<string, Map<string, DocumentRow>>();
  for (const [name, rows] of tables) {
    copy.set(name, new Map(rows));
  }
  return copy;
}

export class FakeDocumentStore implements DocumentStore {
  constructor(
    private readonly database: FakeDocumentDatabase,
    private readonly table: string,
  ) {}

  async read(uuid: string): Promise<DocumentRow | null> {
    return this.database.table(this.table).get(uuid) ?? null;
  }

  async write(row: DocumentRow): Promise<void> {
    this.database.table(this.table).set(row.uuid, row);
  }

  async remove(uuid: string): Promise<void> {
    this.database.table(this.table).delete(uuid);
  }

  async list(): Promise<DocumentRow[]> {
    return [...this.database.table(this.table).values()];
  }

  transaction<T>(work: () => Promise<T>): Promise<T> {
    return this.database.transaction(work);
  }
}
