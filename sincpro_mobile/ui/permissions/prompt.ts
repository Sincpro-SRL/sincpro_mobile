import { EPermission, type PermissionStatus } from "@sincpro/mobile/domain/permissions";
import { PERMISSION_NAMES } from "@sincpro/mobile/services/permissions/common";

/** What each permission is for, read before the system's dialog. */
export const PERMISSION_PURPOSES: Readonly<Record<EPermission, string>> = {
  [EPermission.BLUETOOTH]: "Para buscar la impresora, conectarla e imprimir.",
  [EPermission.LOCATION]: "Para registrar dónde se hace cada operación.",
};

/** What a person may do about a permission: ask for it, or grant it in the system's settings. */
export type PermissionAction = "request" | "settings";

/** What a screen shows of a permission: its line, and the one thing the person can do. */
export interface PermissionPrompt {
  readonly message: string;
  readonly action: PermissionAction | null;
  readonly actionLabel: string | null;
}

/**
 * The words and the action for a permission where it stands. Before the system's dialog the
 * person reads what it is for (`reason`); a blocked one leads to the system's settings.
 */
export function permissionPrompt(
  kind: EPermission,
  status: PermissionStatus | undefined,
  reason: string = PERMISSION_PURPOSES[kind],
): PermissionPrompt {
  const name = PERMISSION_NAMES[kind];
  switch (status) {
    case undefined:
      return { message: "Verificando permiso...", action: null, actionLabel: null };
    case "granted":
      return { message: "Permiso activo", action: null, actionLabel: null };
    case "denied":
      return { message: reason, action: "request", actionLabel: "Permitir" };
    case "blocked":
      return {
        message: `${name} está bloqueado: habilítalo en los ajustes del teléfono.`,
        action: "settings",
        actionLabel: "Abrir ajustes",
      };
    case "unavailable":
      return {
        message: `Este dispositivo no tiene ${name}.`,
        action: null,
        actionLabel: null,
      };
  }
}
