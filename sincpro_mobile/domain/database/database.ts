export interface IDatabase {
  name: string;
  description: string;
  tableName: string;
}

export interface IDatabaseTable {
  name: string;
}

export interface ITable {
  id: number;
  data: string;
}
export interface IMigration {
  name: string;
  migrationFn: () => Promise<void>;
}
