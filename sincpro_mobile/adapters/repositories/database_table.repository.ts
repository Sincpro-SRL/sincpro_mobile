import { IDatabaseTable } from "@sincpro/mobile/domain/database";
import { EntityCollection, ICriteria } from "@sincpro/mobile/domain/entity";
import { ECommonRepository } from "@sincpro/mobile/domain/repositories";
import { DBCursor } from "@sincpro/mobile/infrastructure/database";
import logger from "@sincpro/mobile/infrastructure/logger";

class DatabaseTableRepositoryImpl {
  public readonly name = ECommonRepository.DATABASE_TABLE;

  async findAll(): Promise<EntityCollection<any>> {
    logger.debug("Fetching all database tables");
    const result = await DBCursor.getAllAsync<IDatabaseTable>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';`,
    );
    return new EntityCollection((result ?? []) as any);
  }

  async getTableData(tableName: string): Promise<any[]> {
    const query = `SELECT * FROM ${tableName};`;
    return await DBCursor.getAllAsync<any>(query);
  }

  async save(entity: any | any[] | EntityCollection<any>): Promise<void> {
    throw new Error("Not implemented");
  }

  async remove(entity: any | any[]): Promise<void> {
    throw new Error("Not implemented");
  }

  async findById(id: number | string): Promise<any | null> {
    throw new Error("Not implemented");
  }

  async findByCriteria(criteria: ICriteria<any>[]): Promise<EntityCollection<any>> {
    throw new Error("Not implemented");
  }
}

export const DatabaseTableRepository = new DatabaseTableRepositoryImpl();
