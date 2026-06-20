import { IDatabaseTable } from "../domain/database";
import { ECommonRepository, repos } from "../entrypoints/db";
import { loggerUseCases } from "../infrastructure/logger";

class DatabaseTablesUseCase {
  private get repository() {
    return repos.get(ECommonRepository.DATABASE_TABLE);
  }
  async getAllTables(): Promise<IDatabaseTable[]> {
    loggerUseCases.info("Getting all database tables");
    const tables = await this.repository.findAll();
    return tables.toArray();
  }
  async getTableData(tableName: string): Promise<any[]> {
    loggerUseCases.info(`Getting data for ${tableName}`);
    const result = await this.repository.getTableData(tableName);
    loggerUseCases.info(`Retrieved ${result.length} records from ${tableName}`);
    return result;
  }
}

export const databaseTablesUseCase = new DatabaseTablesUseCase();
