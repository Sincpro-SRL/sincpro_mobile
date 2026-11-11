import type { EventRecord } from "@sincpro/mobile/domain/events";
import {
  eventStatusBadge,
  eventStatusIcon,
  eventStatusLabel,
} from "@sincpro/mobile/ui/components/molecules/event-status";
import { Display } from "@sincpro/mobile-ui/Display";
import { Pressable } from "@sincpro/mobile-ui/primitives/Pressable";
import { useTheme } from "@sincpro/mobile-ui/theme";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { memo } from "react";
import { View } from "react-native";

interface EventRowProps {
  item: EventRecord;
  /** The screen owns the one action sheet; a row never mounts an overlay. */
  onOpen: (event: EventRecord) => void;
}

function EventRow({ item, onOpen }: EventRowProps) {
  const theme = useTheme();

  if (!item) return null;

  const failed = item.state === "set_aside";

  return (
    <View className="border-b border-border-default bg-bg-card">
      <Pressable
        accessibilityHint="Abre las acciones del evento"
        accessibilityRole="button"
        className="flex-row items-center gap-2 px-4 py-2"
        onPress={() => onOpen(item)}
      >
        <Display.Icon
          color={failed ? theme.danger : theme.text.secondary}
          name={eventStatusIcon(item.state)}
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
            value={item.publishedAt}
          />
        </View>
        <Display.Badge
          label={eventStatusLabel(item.state)}
          variant={eventStatusBadge(item.state)}
        />
      </Pressable>
    </View>
  );
}

export default memo(EventRow);
