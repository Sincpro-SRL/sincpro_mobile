import { Command } from "@sincpro/client-framework";
import type { IDatabaseTable } from "@sincpro/mobile/domain/database";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

export class CommandListTables extends Command<IDatabaseTable[]> {}

/** The tables of the device's database — the database screen. */
@commonBoundedContext.feature(CommandListTables)
export class ListTables extends Feature<CommandListTables, IDatabaseTable[]> {
  async execute(): Promise<IDatabaseTable[]> {
    const tables = (await this.databaseTables.findAll()).toArray() as IDatabaseTable[];
    this.span.set({ "database.tables": tables.length });
    return tables;
  }
}
