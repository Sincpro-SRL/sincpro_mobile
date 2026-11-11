import { Command } from "@sincpro/client-framework";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

export class CommandReadTable extends Command<Record<string, unknown>[]> {
  constructor(readonly tableName: string) {
    super();
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
