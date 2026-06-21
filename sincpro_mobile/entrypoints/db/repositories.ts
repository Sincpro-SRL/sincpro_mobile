import { EntityCollection, RemoteEntityCollection } from "@sincpro/mobile/domain/entity";
import { DomainAppError } from "@sincpro/mobile/exceptions";
import { loggerRepositories } from "@sincpro/mobile/infrastructure/logger";

export class RepositoriesContainer {
  private registry: Record<string, any> = {};

  register(repositories: Record<string, any>): void {
    this.registry = { ...this.registry, ...repositories };
  }

  get<T = any>(repositoryKey: string): T {
    const repo = this.registry[repositoryKey];
    if (!repo) {
      throw new DomainAppError(`[RepositoryFacade] Repository not found: ${repositoryKey}`);
    }
    return repo as T;
  }

  resolveRelation(
    repositoryKey: string,
    foreignKeyValue: number | string | number[] | string[],
    remote: boolean = false,
  ): EntityCollection<any> | RemoteEntityCollection<any> | undefined {
    const repo = this.registry[repositoryKey];
    if (!repo) {
      loggerRepositories.warn(`[RepositoryFacade] Repository not found: ${repositoryKey}`);
      return Array.isArray(foreignKeyValue) ? new EntityCollection([]) : undefined;
    }
    if (Array.isArray(foreignKeyValue)) {
      if (remote) {
        return repo.findByRemoteIdsSync?.(foreignKeyValue) ?? new RemoteEntityCollection([]);
      }
      return repo.findByIdsSync?.(foreignKeyValue) ?? new EntityCollection([]);
    }
    if (remote) {
      return repo.findByRemoteIdSync?.(foreignKeyValue) ?? undefined;
    }
    return repo.findByIdSync?.(foreignKeyValue) ?? undefined;
  }
}

export const repos = new RepositoriesContainer();
