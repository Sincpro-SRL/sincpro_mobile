import type { Notice } from "@sincpro/mobile/domain/notifier";
import { EPermission, type PermissionStatus } from "@sincpro/mobile/domain/permissions";

/** A permission as the person reads it. */
export const PERMISSION_NAMES: Readonly<Record<EPermission, string>> = {
  [EPermission.BLUETOOTH]: "Bluetooth",
  [EPermission.LOCATION]: "Ubicación",
};

/**
 * What the person reads after asking for a permission, by its answer; `null` when there is
 * nothing to tell (it was already granted).
 */
export function permissionAnswer(
  kind: EPermission,
  status: PermissionStatus,
  asked: boolean,
): Notice | null {
  const name = PERMISSION_NAMES[kind];
  if (status === "granted") {
    return asked
      ? {
          name: "permission.granted",
          title: `${name} habilitado`,
          message: `El permiso de ${name} fue concedido`,
          variant: "success",
        }
      : null;
  }
  if (status === "blocked") {
    return {
      name: "permission.blocked",
      title: `${name} bloqueado`,
      message: `Habilita el permiso de ${name} en los ajustes del teléfono`,
      variant: "danger",
    };
  }
  if (status === "unavailable") {
    return {
      name: "permission.unavailable",
      title: `${name} no disponible`,
      message: `Este dispositivo no tiene ${name}`,
      variant: "warning",
    };
  }
  return {
    name: "permission.denied",
    title: `${name} no habilitado`,
    message: `Sin el permiso de ${name} esta función no está disponible`,
    variant: "warning",
  };
}
