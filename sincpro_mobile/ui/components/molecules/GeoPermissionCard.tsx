import { Actions } from "@sincpro/mobile-ui/Actions";
import { Display } from "@sincpro/mobile-ui/Display";
import { useTheme } from "@sincpro/mobile-ui/theme";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { View } from "react-native";

interface GeoPermissionCardProps {
  title: string;
  hasPermission?: boolean;
  loading?: boolean;
  handleRequestPermission?: () => void;
}

function GeoPermissionCard({
  title,
  loading,
  handleRequestPermission,
  hasPermission,
}: GeoPermissionCardProps) {
  const theme = useTheme();
  const granted = hasPermission === true;

  return (
    <Display.Card className="my-2">
      <View className="flex-row items-center gap-3">
        <Display.Icon
          color={granted ? theme.success : theme.danger}
          name={granted ? "success" : "location-disabled"}
          size={24}
        />
        <View className="min-w-0 flex-1">
          <Typography.Text semibold>{title}</Typography.Text>
          <Typography.Text
            className={granted ? "text-success" : "text-danger"}
            variant="bodySmall"
          >
            {granted ? "Permiso activo" : "Permiso inactivo"}
          </Typography.Text>
        </View>
      </View>
      {!granted ? (
        <Actions.Button
          className="mt-3"
          loading={loading}
          onPress={handleRequestPermission}
          size="small"
          title="Abrir Configuración"
          variant="cta"
        />
      ) : null}
    </Display.Card>
  );
}

export default GeoPermissionCard;
