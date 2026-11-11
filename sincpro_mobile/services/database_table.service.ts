import { logger } from "@sincpro/client-framework";
import { IDatabaseTable } from "@sincpro/mobile/domain/database";
import { ECommonRepository, repos } from "@sincpro/mobile/entrypoints/db";
import { replaceable } from "@sincpro/mobile/framework/replaceable";

export class DatabaseTablesUseCase {
  private get repository() {
    return repos.get(ECommonRepository.DATABASE_TABLE);
  }
  async getAllTables(): Promise<IDatabaseTable[]> {
    logger.info("Getting all database tables");
    const tables = await this.repository.findAll();
    return tables.toArray();
  }
  async getTableData(tableName: string): Promise<any[]> {
    logger.info(`Getting data for ${tableName}`);
    const result = await this.repository.getTableData(tableName);
    logger.info(`Retrieved ${result.length} records from ${tableName}`);
    return result;
  }
}

const databaseTablesUseCaseSlot = replaceable(new DatabaseTablesUseCase());

/** Swaps the implementation for a subclass, for the whole app and the core. */
export function setDatabaseTablesUseCase(service: DatabaseTablesUseCase): void {
  databaseTablesUseCaseSlot.set(service);
}

export const databaseTablesUseCase: DatabaseTablesUseCase =
  databaseTablesUseCaseSlot.instance;
