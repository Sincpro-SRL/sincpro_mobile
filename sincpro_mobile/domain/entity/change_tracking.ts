import { type Entity } from "@sincpro/mobile/domain/entity/entity";
import { DomainEvent } from "@sincpro/mobile/domain/events/domain_event";

import { type AnyClass, heldEntities } from "./relations";

const SKIPPED = new Set(["uuid", "version", "createdAt", "updatedAt", "eventIds"]);

export class EntityUpdated extends DomainEvent {
  public readonly name = "entity.updated";
  public readonly label = "Updated";
  public changes: Record<string, { from: string; to: string }> = {};
}

export function fieldSnapshot(
  entity: Entity,
  seen: Set<object> = new Set(),
): Record<string, string> {
  seen.add(entity);
  const snapshot: Record<string, string> = {};
  for (const key of Object.keys(entity)) {
    if (key.startsWith("_") || SKIPPED.has(key)) continue;
    const value = (entity as unknown as Record<string, unknown>)[key];
    if (typeof value === "function") continue;
    snapshot[key] = printed(value, seen);
  }
  return snapshot;
}

function printed(value: unknown, seen: Set<object>): string {
  const held = heldEntities(value);
  if (held.length > 0) {
    return JSON.stringify(
      held.map((one) =>
        seen.has(one) ? { uuid: one.uuid } : fieldSnapshot(one as Entity, seen),
      ),
    );
  }
  if (Array.isArray(value)) return value.length === 0 ? "" : JSON.stringify(value);
  if (value === undefined) return "";
  return JSON.stringify(value);
}

type Tracked = {
  takeSnapshot(): void;
  recordChanges(): void;
};

export function withChangeTracking<T extends Entity, C extends AnyClass<T>>(Base: C) {
  class ChangeTracked extends (Base as any) {
    _changeSnapshot: Record<string, string> = {};
    _snapshotTaken = false;

    // TS2545: a mixin class must declare a rest constructor.
    // eslint-disable-next-line @typescript-eslint/no-useless-constructor
    constructor(...args: any[]) {
      super(...args);
    }

    takeSnapshot(): void {
      this._changeSnapshot = fieldSnapshot(this as unknown as Entity);
      this._snapshotTaken = true;
    }

    recordChanges(): void {
      if (!this._snapshotTaken) return;
      const next = fieldSnapshot(this as unknown as Entity);
      const changes: Record<string, { from: string; to: string }> = {};
      for (const key of new Set([
        ...Object.keys(this._changeSnapshot),
        ...Object.keys(next),
      ])) {
        if (this._changeSnapshot[key] !== next[key]) {
          changes[key] = {
            from: this._changeSnapshot[key] ?? "",
            to: next[key] ?? "",
          };
        }
      }
      if (Object.keys(changes).length === 0) return;
      (this as unknown as Entity).record(EntityUpdated, { changes });
    }
  }

  return ChangeTracked as unknown as C & { new (...args: any[]): T & Tracked };
}

export function isChangeTracked(entity: Entity): entity is Entity & Tracked {
  return typeof (entity as unknown as Partial<Tracked>).recordChanges === "function";
}
