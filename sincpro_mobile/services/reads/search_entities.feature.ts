import type { Criteria } from "@sincpro/criteria";
import type { Entity } from "@sincpro/mobile/domain/entity/entity";
import type { AnyClass } from "@sincpro/mobile/domain/entity/relations";
import { SearchQuery } from "@sincpro/mobile/domain/reads/queries";
import { EntityReads } from "@sincpro/mobile/framework/entity_reads";
import { commonBoundedContext } from "@sincpro/mobile/infrastructure/framework";

export class CommandSearchEntities<T extends Entity> extends SearchQuery<T> {
  constructor(
    readonly entity: AnyClass<T>,
    criteria: Criteria<T> = {},
  ) {
    super(criteria);
  }
}

/** A page of any entity by criteria, as the entity reads itself: `Page<T>`, with its cursor. */
@commonBoundedContext.feature(CommandSearchEntities)
export class SearchEntities extends EntityReads<CommandSearchEntities<Entity>> {}
