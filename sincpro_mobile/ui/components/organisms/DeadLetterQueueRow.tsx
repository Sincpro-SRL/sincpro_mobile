import { IntegrationEvent } from "@sincpro/mobile/domain/events";
import { EventActionSheet } from "@sincpro/mobile/ui/components/organisms/EventActionSheet";
import { Display } from "@sincpro/mobile-ui/Display";
import { useTheme } from "@sincpro/mobile-ui/theme";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { useState } from "react";
import { Pressable, View } from "react-native";

interface DeadLetterQueueRowProps {
  item: IntegrationEvent;
  onRetry: (event: IntegrationEvent) => Promise<void> | void;
}

function DeadLetterQueueRow({ item, onRetry }: DeadLetterQueueRowProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

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
        onPress={() => setOpen(true)}
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
      <EventActionSheet
        event={item}
        onClose={() => setOpen(false)}
        onRetry={onRetry}
        retryLabel="Reintentar"
        visible={open}
      />
    </View>
  );
}

export default DeadLetterQueueRow;
