import { Command } from "@sincpro/client-framework";
import { type Criteria, type CriteriaFor, type Page, plain } from "@sincpro/criteria";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

export class CommandReadTable extends Command<Page<Record<string, unknown>>> {
  readonly criteria: Criteria;

  constructor(
    readonly tableName: string,
    criteria: CriteriaFor<Record<string, unknown>> = {},
    /** What the person typed: looked for in the table's identities and its document. */
    readonly text = "",
  ) {
    super();
    this.criteria = plain(criteria);
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
