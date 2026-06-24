import { Display, Form } from "@sincpro/mobile-ui/index";
import { theme } from "@sincpro/mobile-ui/theme";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { View } from "react-native";
import { tv } from "tailwind-variants";

const statusTextVariants = tv({
  variants: {
    granted: {
      true: "text-success",
      false: "text-danger",
    },
  },
});

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
  const granted = hasPermission !== undefined ? hasPermission : false;

  return (
    <Display.Card className="my-2.5">
      <View className="flex-row items-start">
        <Display.Icon
          color={granted ? theme.success : theme.danger}
          name={granted ? "check-circle" : "location-off"}
          size={35}
          type="material"
        />
        <View className="ml-2.5 flex-1">
          <Typography.Text className="text-base mb-1" semibold>
            {title}
          </Typography.Text>
          <Typography.Text className={statusTextVariants({ granted })}>
            {granted ? "Permiso activo." : "Permiso inactivo."}
          </Typography.Text>
          {!granted && (
            <Form.Button
              loading={loading}
              onPress={handleRequestPermission}
              size="small"
              title={"Abrir Configuración"}
              variant="cta"
            />
          )}
        </View>
      </View>
    </Display.Card>
  );
}

export default GeoPermissionCard;
