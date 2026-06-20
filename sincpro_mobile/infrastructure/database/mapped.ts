import type { RepositoriesContainer } from "../../entrypoints/db/repositories";
import { DomainAppError } from "../../exceptions";
import { loggerRepositories } from "../logger";
/**
 * Repository facade reference that will be injected after initialization.
 * This avoids circular import issues by delaying the repository resolution.
 */
let repositoryFacade: RepositoriesContainer | null = null;

/**
 * Initializes the repository facade for use with the @mapped decorator.
 *
 * This function MUST be called during application bootstrap, after all repositories
 * are loaded but before any entity with @mapped decorator is instantiated.
 *
 * @param repos - The repository facade object containing all domain repositories
 *
 * @example
 * // In your app bootstrap (e.g., InfrastructureOrchestrator)
 * import { initializeRepositoryFacade } from "./";
 * import { repos } from "../../entrypoints/db";
 *
 * async function bootstrap() {
 *   await initDatabase();
 *   initializeRepositoryFacade(repos); // ← Initialize after DB and repos are ready
 *   await runMigrations();
 * }
 */
export function initializeRepositoryFacade(repos: RepositoriesContainer): void {
  repositoryFacade = repos;
  loggerRepositories.info("[Mapped] Repository facade initialized for @mapped decorator");
}

function resolveEntityInternal(
  context: "mapped" | "resolveEntity",
  repositoryKey: string,
  fkValue: any,
  remote: boolean = false,
): any {
  if (!repositoryFacade) {
    throw new DomainAppError(
      `[${context}] Repository facade not initialized. ` +
        "Call initializeRepositoryFacade(repos) during app bootstrap.",
    );
  }

  try {
    repositoryFacade.get(repositoryKey as any);
  } catch (error) {
    throw new DomainAppError(`[${context}] ${(error as Error).message}`);
  }

  return repositoryFacade.resolveRelation(repositoryKey, fkValue, remote);
}

/**
 * Resolves an entity or collection from repository by foreign key value.
 *
 * @param repositoryKey - Repository enum key (EDistributionRepository, ECommonRepository)
 * @param fkValue - Foreign key: single ID (uuid/remoteId) or array of IDs
 * @param remote - Use remoteId lookup instead of uuid (default: false)
 * @returns Single entity, EntityCollection, or undefined if not found
 * @throws DomainAppError if repository key doesn't exist in registry
 *
 * @example
 * // Local entity by uuid
 * const customer = resolveEntity(EDistributionRepository.CUSTOMER, "uuid-123");
 *
 * @example
 * // Remote entity by remoteId
 * const product = resolveEntity(EDistributionRepository.PRODUCT, 456, true);
 *
 * @example
 * // Collection by array of IDs
 * const payments = resolveEntity(EDistributionRepository.PAYMENT, [1, 2, 3], true);
 *
 * @example
 * // Usage in Entity to refresh from DB
 * async getRefreshedEntity(repositoryKey: string): Promise<this> {
 *   return resolveEntity(repositoryKey, this.uuid) as this;
 * }
 */
export function resolveEntity(
  repositoryKey: string,
  fkValue: any,
  remote: boolean = false,
): any {
  return resolveEntityInternal("resolveEntity", repositoryKey, fkValue, remote);
}

/**
 * Decorator for automatic runtime resolution of database relations using synchronous queries.
 *
 * This decorator enables entities to resolve their relationships automatically using getters,
 * eliminating the need for manual hydration functions and avoiding circular import issues.
 *
 * **Important:** This decorator does NOT cache results. Every access to the getter will
 * query the database to ensure you always get fresh, up-to-date data.
 *
 * It works by:
 * 1. Detecting the foreign key type (scalar vs array) automatically
 * 2. Calling the appropriate repository sync method (findByIdSync or findByIdsSync)
 * 3. Returning fresh data on every access (no caching)
 *
 * @param repositoryKey - The repository key from the enum (EDistributionRepository or ECommonRepository)
 * @param foreignKey - The name of the property on the entity that contains the foreign key (ID or array of IDs)
 *
 * @param remote - Optional flag indicating if the foreign keys are remote IDs.
 * @returns A decorator function that can be applied to entity getters
 *
 * @example
 * // One-to-One relationship (hasOne)
 * import { mapped } from "./";
 * import { EDistributionDomainRepository } from "../../entrypoints/db";
 *
 * export class SaleOrder {
 *   customerId: number;
 *
 *   @mapped(EDistributionDomainRepository.CUSTOMER, "customerId")
 *   get customer() {
 *     return undefined; // This value is replaced by the decorator at runtime
 *   }
 * }
 *
 * // Usage:
 * const order = new SaleOrder({ id: 1, customerId: 123 });
 * console.log(order.customer.name); // Queries database on every access
 * console.log(order.customer.vat);  // Queries database again (fresh data)
 *
 * @example
 * // One-to-Many relationship (hasMany)
 * export class SaleOrder {
 *   paymentIds: number[];
 *
 *   @mapped(EDistributionRepository.PAYMENT, "paymentIds")
 *   get payments() {
 *     return []; // This value is replaced by the decorator at runtime
 *   }
 * }
 *
 * // Usage:
 * const order = new SaleOrder({ id: 1, paymentIds: [10, 20, 30] });
 * order.payments.forEach(payment => console.log(payment.amount)); // Fresh data on every access
 *
 * @remarks
 * **Requirements:**
 * - The target repository MUST implement `findByIdSync()` for scalar foreign keys
 * - The target repository MUST implement `findByIdsSync()` for array foreign keys
 * - The database must be initialized before accessing decorated properties
 *
 * **Advantages:**
 * - ✅ No circular import issues (uses enum-based repository keys resolved at runtime)
 * - ✅ Automatic type detection (scalar vs array)
 * - ✅ Always returns fresh data from the database (no stale cache)
 * - ✅ Clean, declarative syntax
 * - ✅ Type-safe when using repository enums
 * - ✅ No memory overhead from caching
 * - ✅ No domain knowledge needed - just use the enum
 *
 * **Limitations:**
 * - ⚠️ Blocks the main thread on every access (uses synchronous SQLite queries)
 * - ⚠️ Performance cost on repeated access (queries database each time)
 * - ⚠️ Only works for simple ID-based lookups (no complex filters or joins)
 * - ⚠️ Repository must support sync operations (optional methods in IRepository)
 *
 * @see {@link IRepository.findByIdSync} - Required repository method for hasOne relations
 * @see {@link IRepository.findByIdsSync} - Required repository method for hasMany relations
 */
export function mapped(repositoryKey: string, foreignKey: string, remote: boolean = false) {
  return function (target: any, propertyKey: string, descriptor?: PropertyDescriptor) {
    loggerRepositories.warn(
      `[Mapped] Setting up mapped relation for ${target.constructor.name}.${propertyKey} ` +
        `using repository "${repositoryKey}" and foreign key "${foreignKey}"`,
    );

    const getter = function (this: any) {
      const fkValue = this[foreignKey];

      if (!fkValue) {
        return undefined;
      }

      return resolveEntityInternal("mapped", repositoryKey, fkValue, remote);
    };

    if (descriptor) {
      descriptor.get = getter;
    } else {
      Object.defineProperty(target, propertyKey, {
        get: getter,
        enumerable: true,
        configurable: true,
      });
    }
  };
}
