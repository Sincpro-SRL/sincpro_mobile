import { Command } from "@sincpro/client-framework";
import type { Criteria, Page } from "@sincpro/criteria";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

export class CommandReadTable extends Command<Page<Record<string, unknown>>> {
  constructor(
    readonly tableName: string,
    readonly criteria: Criteria = {},
    /** What the person typed: looked for in the table's identities and its document. */
    readonly text = "",
  ) {
    super();
  }
}

/** A page of one table's rows, as stored, newest first: the next one asked with its cursor. */
@commonBoundedContext.feature(CommandReadTable)
export class ReadTable extends Feature<CommandReadTable, Page<Record<string, unknown>>> {
  async execute(command: CommandReadTable): Promise<Page<Record<string, unknown>>> {
    const page = await this.databaseTables.page(
      command.tableName,
      command.criteria,
      command.text,
    );
    this.span.set({ "database.table": command.tableName, "database.rows": page.rows.length });
    return page;
  }
}
