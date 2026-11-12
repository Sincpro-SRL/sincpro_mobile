import type { CriteriaFor } from "@sincpro/criteria";
import type { Entity } from "@sincpro/mobile/domain/entity/entity";
import type { AnyClass } from "@sincpro/mobile/domain/entity/relations";
import { GetQuery, type ReadKey } from "@sincpro/mobile/domain/reads/queries";
import { EntityReads } from "@sincpro/mobile/framework/entity_reads";
import { commonBoundedContext } from "@sincpro/mobile/infrastructure/framework";

export class CommandGetEntity<T extends Entity> extends GetQuery<T> {
  constructor(
    readonly entity: AnyClass<T>,
    id: ReadKey,
    criteria: CriteriaFor<T> = {},
  ) {
    super(id, criteria);
  }
}

/** One record of any entity by its key (`DEFAULT_GET_ID`), or `AggregateNotFound`. */
@commonBoundedContext.feature(CommandGetEntity)
export class GetEntity extends EntityReads<CommandGetEntity<Entity>> {}
