import type {
  EPermission,
  PermissionStates,
  PermissionStatus,
} from "@sincpro/mobile/domain/permissions";

/** Each permission's last known status, held by the process; a change tells every follower. */
export function createPermissionStates(): PermissionStates {
  const states = new Map<EPermission, PermissionStatus>();
  const listeners = new Set<() => void>();
  return {
    get: (kind) => states.get(kind),
    set(kind, status) {
      if (states.get(kind) === status) return;
      states.set(kind, status);
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The core's permission states: what `commonBoundedContext` holds as `permissionStates`. */
export const permissionStates: PermissionStates = createPermissionStates();
