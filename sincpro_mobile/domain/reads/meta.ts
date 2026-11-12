import { describeRows, formatOrder, type Meta } from "@sincpro/criteria";
import type { Entity } from "@sincpro/mobile/domain/entity/entity";

/** What an entity carries for the framework, never one of its fields. */
const INTERNAL: ReadonlySet<string> = new Set(["REPOSITORY", "eventIds"]);

const described = new WeakMap<Function, Meta>();

/**
 * The model of an entity, as a page carries it (`Page.meta`): its fields — read off a blank one,
 * each with its type and the operators it takes — and what it says about itself: its identity,
 * key (`DEFAULT_GET_ID`), order, display and literal search. What a screen builds its filters,
 * its columns and a select's labels from, as it would from a server's definition.
 */
export function metaOf(entity: typeof Entity): Meta {
  const known = described.get(entity);
  if (known) return known;
  const blank = JSON.parse((entity.obj({}) as Entity).asJSON()) as Record<string, unknown>;
  const sample = Object.fromEntries(
    Object.entries({ name: "", ...blank }).filter(
      ([field]) => !INTERNAL.has(field) && !field.startsWith("_"),
    ),
  );
  const meta: Meta = {
    ...describeRows([sample], {
      aggregate: entity.name,
      identity: "uuid",
      defaultOrder: formatOrder(entity.DEFAULT_ORDER()),
    }),
    display: entity.DEFAULT_DISPLAY(),
    get_id: entity.DEFAULT_GET_ID(),
    search: entity.DEFAULT_LITERAL_SEARCH() as Record<string, unknown> | null,
  };
  described.set(entity, meta);
  return meta;
}
