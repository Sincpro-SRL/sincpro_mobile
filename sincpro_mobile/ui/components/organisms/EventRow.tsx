import { EEventStatus, IntegrationEvent } from "@sincpro/mobile/domain/events";
import {
  eventStatusBadge,
  eventStatusIcon,
  eventStatusLabel,
} from "@sincpro/mobile/ui/components/molecules/event-status";
import { EventActionSheet } from "@sincpro/mobile/ui/components/organisms/EventActionSheet";
import { Display } from "@sincpro/mobile-ui/Display";
import { useTheme } from "@sincpro/mobile-ui/theme";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { useState } from "react";
import { Pressable, View } from "react-native";

interface EventRowProps {
  item: IntegrationEvent;
  onRetry: (event: IntegrationEvent) => Promise<void> | void;
}

function EventRow({ item, onRetry }: EventRowProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  if (!item) return null;

  const failed = item.status === EEventStatus.FAILED;

  return (
    <View className="border-b border-border-default bg-bg-card">
      <Pressable
        accessibilityHint="Abre las acciones del evento"
        accessibilityRole="button"
        className="flex-row items-center gap-2 px-4 py-2"
        onPress={() => setOpen(true)}
      >
        <Display.Icon
          color={failed ? theme.danger : theme.text.secondary}
          name={eventStatusIcon(item.status)}
          size={16}
        />
        <View className="min-w-0 flex-1">
          <Typography.Text numberOfLines={1} semibold>
            {item.label || item.name}
          </Typography.Text>
          <Display.Date
            className="text-text-tertiary"
            relative
            showTime={false}
            textVariant="caption"
            value={item.createdAt}
          />
        </View>
        <Display.Badge
          label={eventStatusLabel(item.status)}
          variant={eventStatusBadge(item.status)}
        />
      </Pressable>
      <EventActionSheet
        event={item}
        onClose={() => setOpen(false)}
        onRetry={onRetry}
        visible={open}
      />
    </View>
  );
}

export default EventRow;
