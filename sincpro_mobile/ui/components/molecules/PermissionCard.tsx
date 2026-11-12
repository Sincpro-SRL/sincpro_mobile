import { EPermission } from "@sincpro/mobile/domain/permissions";
import { PERMISSION_NAMES } from "@sincpro/mobile/services/permissions/common";
import { permissionPrompt, usePermission } from "@sincpro/mobile/ui/permissions";
import { Actions } from "@sincpro/mobile-ui/Actions";
import { Display, type IconName } from "@sincpro/mobile-ui/Display";
import { useTheme } from "@sincpro/mobile-ui/theme";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { View } from "react-native";

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
}

/**
 * A permission where it stands, and the one thing to do about it: «Permitir» after reading what
 * it is for (the system's dialog comes only then), or «Abrir ajustes» when it is blocked. It is
 * read again when the app comes back from the settings.
 */
export function PermissionCard({ kind, title, reason }: PermissionCardProps) {
  const theme = useTheme();
  const permission = usePermission(kind);
  const prompt = permissionPrompt(kind, permission.status, reason);
  const action = prompt.action;

  return (
    <Display.Card className="my-2">
      <View className="flex-row items-center gap-3">
        <Display.Icon
          color={permission.granted ? theme.success : theme.danger}
          name={permission.granted ? "success" : NOT_GRANTED_ICONS[kind]}
          size={24}
        />
        <View className="min-w-0 flex-1">
          <Typography.Text semibold>{title ?? PERMISSION_NAMES[kind]}</Typography.Text>
          <Typography.Text
            className={permission.granted ? "text-success" : "text-text-secondary"}
            variant="bodySmall"
          >
            {prompt.message}
          </Typography.Text>
        </View>
      </View>
      {action && prompt.actionLabel ? (
        <Actions.Button
          className="mt-3"
          loading={permission.busy}
          onPress={() => void permission.act(action).catch(() => undefined)}
          size="small"
          title={prompt.actionLabel}
          variant="cta"
        />
      ) : null}
    </Display.Card>
  );
}
