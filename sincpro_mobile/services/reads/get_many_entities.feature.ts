import type { CriteriaFor } from "@sincpro/criteria";
import type { Entity } from "@sincpro/mobile/domain/entity/entity";
import type { AnyClass } from "@sincpro/mobile/domain/entity/relations";
import { GetManyQuery, type ReadKey } from "@sincpro/mobile/domain/reads/queries";
import { EntityReads } from "@sincpro/mobile/framework/entity_reads";
import { commonBoundedContext } from "@sincpro/mobile/infrastructure/framework";

export class CommandGetManyEntities<T extends Entity> extends GetManyQuery<T> {
  constructor(
    readonly entity: AnyClass<T>,
    ids: readonly ReadKey[],
    criteria: CriteriaFor<T> = {},
  ) {
    super(ids, criteria);
  }
}

/** Several records of any entity by their keys, in the order asked, and the keys with none. */
@commonBoundedContext.feature(CommandGetManyEntities)
export class GetManyEntities extends EntityReads<CommandGetManyEntities<Entity>> {}
