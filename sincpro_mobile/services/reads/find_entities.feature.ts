import type { CriteriaFor } from "@sincpro/criteria";
import type { Entity } from "@sincpro/mobile/domain/entity/entity";
import type { AnyClass } from "@sincpro/mobile/domain/entity/relations";
import { LiteralSearchQuery } from "@sincpro/mobile/domain/reads/queries";
import { EntityReads } from "@sincpro/mobile/framework/entity_reads";
import { commonBoundedContext } from "@sincpro/mobile/infrastructure/framework";

export class CommandFindEntities<T extends Entity> extends LiteralSearchQuery<T> {
  constructor(
    readonly entity: AnyClass<T>,
    text = "",
    criteria: CriteriaFor<T> = {},
  ) {
    super(text, criteria);
  }
}

/** What a select shows of any entity for a typed text, as its `DEFAULT_LITERAL_SEARCH` says. */
@commonBoundedContext.feature(CommandFindEntities)
export class FindEntities extends EntityReads<CommandFindEntities<Entity>> {}
