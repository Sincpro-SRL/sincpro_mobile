import { IntegrationEvent } from "@sincpro/mobile/domain/events";
import { Display } from "@sincpro/mobile-ui/Display";
import { Pressable } from "@sincpro/mobile-ui/primitives/Pressable";
import { useTheme } from "@sincpro/mobile-ui/theme";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { memo } from "react";
import { View } from "react-native";

interface DeadLetterQueueRowProps {
  item: IntegrationEvent;
  /** The screen owns the one action sheet; a row never mounts an overlay. */
  onOpen: (event: IntegrationEvent) => void;
}

function DeadLetterQueueRow({ item, onOpen }: DeadLetterQueueRowProps) {
  const theme = useTheme();

  if (!item || typeof item !== "object" || !item.name || !item.createdAt) {
    return null;
  }

  const attempts = item.attempts ?? 0;
  const attemptsLabel = attempts === 1 ? "1 intento" : `${attempts} intentos`;

  return (
    <View className="border-b border-border-default bg-bg-card">
      <Pressable
        accessibilityHint="Abre las acciones del evento"
        accessibilityRole="button"
        className="flex-row items-center gap-2 px-4 py-2"
        onPress={() => onOpen(item)}
      >
        <Display.Icon color={theme.danger} name="error" size={16} />
        <View className="min-w-0 flex-1">
          <Typography.Text numberOfLines={1} semibold>
            {item.label || item.name}
          </Typography.Text>
          <Typography.Text
            className={attempts < 3 ? "text-warning" : "text-danger"}
            numberOfLines={1}
            variant="caption"
          >
            {item.errorMessage || attemptsLabel}
          </Typography.Text>
        </View>
        <Typography.Text className="text-text-tertiary" variant="caption">
          {attemptsLabel}
        </Typography.Text>
      </Pressable>
    </View>
  );
}

export default memo(DeadLetterQueueRow);
