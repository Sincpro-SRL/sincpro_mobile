import { type Entity } from "@sincpro/mobile/domain/entity/entity";
import { type AnyClass } from "@sincpro/mobile/domain/entity/relations";

export interface Hook<T extends Entity = Entity> {
  after_read?(record: T): void | Promise<void>;
  before_save?(record: T): void | Promise<void>;
  after_save?(record: T): void | Promise<void>;
  before_create?(record: T): void | Promise<void>;
  after_create?(record: T): void | Promise<void>;
  before_update?(record: T): void | Promise<void>;
  after_update?(record: T): void | Promise<void>;
  before_remove?(record: T): void | Promise<void>;
  after_remove?(record: T): void | Promise<void>;
  after_search?(records: readonly T[]): void | Promise<void>;
}

export type HookMoment =
  | "after_read"
  | "before_save"
  | "after_save"
  | "before_create"
  | "after_create"
  | "before_update"
  | "after_update"
  | "before_remove"
  | "after_remove"
  | "after_search";

export class Hooks {
  private readonly pairs: { type: AnyClass<Entity>; hook: Hook }[] = [];

  on<T extends Entity>(type: AnyClass<T>, hook: Hook<T>): this {
    this.pairs.push({ type: type as AnyClass<Entity>, hook });
    return this;
  }

  of(record: Entity): Hook[] {
    return this.pairs
      .filter(
        (pair) => record instanceof (pair.type as unknown as new (...args: any[]) => Entity),
      )
      .map((pair) => pair.hook);
  }

  ofType(type: AnyClass<Entity>): Hook[] {
    return this.pairs
      .filter(
        (pair) =>
          type === pair.type ||
          (type.prototype as object) instanceof
            (pair.type as unknown as new (...args: any[]) => Entity),
      )
      .map((pair) => pair.hook);
  }
}

export async function fireHooks(
  hooks: readonly Hook[],
  moment: Exclude<HookMoment, "after_search">,
  record: Entity,
): Promise<void> {
  for (const hook of hooks) {
    const method = hook[moment];
    if (method) await method.call(hook, record);
  }
}

export async function fireSearch(
  hooks: readonly Hook[],
  records: readonly Entity[],
): Promise<void> {
  for (const hook of hooks) {
    if (hook.after_search) await hook.after_search(records);
  }
}
