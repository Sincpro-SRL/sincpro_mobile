import { EPermission } from "@sincpro/mobile/domain/permissions";
import { PERMISSION_NAMES } from "@sincpro/mobile/services/permissions/common";
import {
  PERMISSION_PURPOSES,
  permissionPrompt,
  usePermission,
} from "@sincpro/mobile/ui/permissions";
import type { IconName } from "@sincpro/mobile-ui/Display";
import { Feedback } from "@sincpro/mobile-ui/Feedback";

const NOT_GRANTED_ICONS: Readonly<Record<EPermission, IconName>> = {
  [EPermission.BLUETOOTH]: "lock",
  [EPermission.LOCATION]: "location-disabled",
};

interface PermissionCardProps {
  kind: EPermission;
  /** Its name on the card; the permission's by default. */
  title?: string;
  /** What it is for, read before the system's dialog; the core's by default. */
  reason?: string;
  className?: string;
}

/**
 * A permission where it stands, what it is for, and the one thing to do about it: «Permitir»
 * (the system's dialog comes only then) or «Abrir ajustes» when it is blocked. It is read again
 * when the app comes back from the settings. Drawn by the design system's
 * `Feedback.PermissionCard`.
 */
export function PermissionCard({ kind, title, reason, className }: PermissionCardProps) {
  const permission = usePermission(kind);
  const prompt = permissionPrompt(kind, permission.status, reason);
  const action = prompt.action;

  return (
    <Feedback.PermissionCard
      actionLabel={prompt.actionLabel ?? undefined}
      className={className}
      deniedLabel={permission.status === "denied" ? "Permiso inactivo" : prompt.message}
      description={reason ?? PERMISSION_PURPOSES[kind]}
      granted={permission.granted}
      icon={NOT_GRANTED_ICONS[kind]}
      loading={permission.busy}
      onRequest={
        action ? () => void permission.act(action).catch(() => undefined) : undefined
      }
      testID={`permission-${kind}`}
      title={title ?? PERMISSION_NAMES[kind]}
    />
  );
}
