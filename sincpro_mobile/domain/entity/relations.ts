const RELATION = Symbol("relation");

export enum RelationCascade {
  SAVE_AND_REMOVE = "save_and_remove",
  SAVE = "save",
  UPDATE = "update",
  REMOVE = "remove",
  UPDATE_AND_REMOVE = "update_and_remove",
}

export interface Relation {
  field: string;
  type: AnyClass<{ uuid: string }>;
  cascade: RelationCascade;
}

export type AnyClass<T> = Function & { prototype: T };

type RelationConstructor = { [RELATION]?: Relation[] };

export function relation(
  type: AnyClass<{ uuid: string }>,
  cascade: RelationCascade = RelationCascade.SAVE_AND_REMOVE,
) {
  return function (target: object, propertyKey: string): void {
    const ctor = target.constructor as RelationConstructor;
    const relationsOfCtor = ctor[RELATION] ?? [];
    if (!relationsOfCtor.some((item) => item.field === propertyKey)) {
      relationsOfCtor.push({ field: propertyKey, type, cascade });
    }
    ctor[RELATION] = relationsOfCtor;
  };
}

export function relations(entity: object): Relation[] {
  const found: Relation[] = [];
  let ctor = entity.constructor as RelationConstructor | null;
  while (ctor && ctor !== Function.prototype) {
    const declared = ctor[RELATION];
    if (declared) found.push(...declared);
    ctor = Object.getPrototypeOf(ctor);
  }
  return found;
}

export function relationWrites(relation: Relation): boolean {
  return relation.cascade !== RelationCascade.REMOVE;
}

export function relationPersists(relation: Relation, isNew: boolean): boolean {
  switch (relation.cascade) {
    case RelationCascade.SAVE:
    case RelationCascade.SAVE_AND_REMOVE:
      return true;
    case RelationCascade.UPDATE:
    case RelationCascade.UPDATE_AND_REMOVE:
      return !isNew;
    case RelationCascade.REMOVE:
      return false;
  }
}

export function relationRemoves(relation: Relation): boolean {
  switch (relation.cascade) {
    case RelationCascade.SAVE_AND_REMOVE:
    case RelationCascade.UPDATE_AND_REMOVE:
    case RelationCascade.REMOVE:
      return true;
    case RelationCascade.SAVE:
    case RelationCascade.UPDATE:
      return false;
  }
}

export function heldEntities(value: unknown): { uuid: string }[] {
  if (Array.isArray(value)) return value.filter(isEntity);
  if (isEntity(value)) return [value];
  return [];
}

function isEntity(value: unknown): value is { uuid: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "uuid" in value &&
    typeof (value as { uuid: unknown }).uuid === "string"
  );
}
