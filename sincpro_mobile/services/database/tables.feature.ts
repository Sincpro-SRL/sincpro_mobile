import { Command } from "@sincpro/client-framework";
import type { IDatabaseTable } from "@sincpro/mobile/domain/database";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

export class CommandListTables extends Command<IDatabaseTable[]> {}

export class CommandReadTable extends Command<Record<string, unknown>[]> {
  constructor(readonly tableName: string) {
    super();
  }
}

/** The tables of the device's database — the database screen. */
@commonBoundedContext.feature(CommandListTables)
export class ListTables extends Feature<CommandListTables, IDatabaseTable[]> {
  async execute(): Promise<IDatabaseTable[]> {
    const tables = await this.databaseTables.getAllTables();
    this.span.set({ "database.tables": tables.length });
    return tables;
  }
}

/** The rows of one table, as stored. */
@commonBoundedContext.feature(CommandReadTable)
export class ReadTable extends Feature<CommandReadTable, Record<string, unknown>[]> {
  async execute(command: CommandReadTable): Promise<Record<string, unknown>[]> {
    const rows = await this.databaseTables.getTableData(command.tableName);
    this.span.set({ "database.table": command.tableName, "database.rows": rows.length });
    return rows;
  }
}
