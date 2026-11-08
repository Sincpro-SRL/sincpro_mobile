import { IntegrationEvent } from "@sincpro/mobile/domain/events";
import {
  eventStatusIcon,
  eventStatusLabel,
} from "@sincpro/mobile/ui/components/molecules/event-status";
import { Display } from "@sincpro/mobile-ui/Display";
import { Pressable } from "@sincpro/mobile-ui/primitives/Pressable";
import { useTheme } from "@sincpro/mobile-ui/theme";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { memo } from "react";
import { View } from "react-native";

interface EventTimelineItemProps {
  event: IntegrationEvent;
  isLast?: boolean;
  /** The screen owns the one action sheet; an item never mounts an overlay. */
  onOpen: (event: IntegrationEvent) => void;
}

function readableName(event: IntegrationEvent): string {
  if (event.label) return event.label;
  const raw = event.name.split(".").pop()?.replace(/_/g, " ") || event.name;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function dotColor(status: string | undefined, theme: ReturnType<typeof useTheme>): string {
  if (status === "FAILED") return theme.danger;
  if (status === "ACKNOWLEDGED") return theme.success;
  if (status === "PROCESSING") return theme.info;
  if (status === "PENDING") return theme.warning;
  return theme.text.tertiary;
}

function EventTimelineItem({ event, isLast = false, onOpen }: EventTimelineItemProps) {
  const theme = useTheme();
  const color = dotColor(event.status, theme);
  const attempts = event.attempts === 1 ? "1 intento" : `${event.attempts} intentos`;

  return (
    <View className="flex-row">
      <View className="items-center" style={{ width: 28 }}>
        <View
          className="items-center justify-center rounded-full"
          style={{ width: 22, height: 22, marginTop: 2, backgroundColor: color }}
        >
          <Display.Icon
            color={theme.text.inverse}
            name={eventStatusIcon(event.status)}
            size={12}
          />
        </View>
        {!isLast ? (
          <View
            className="my-1 w-0.5 flex-1"
            style={{ backgroundColor: theme.border.default }}
          />
        ) : null}
      </View>

      <Pressable
        accessibilityHint="Abre el detalle del evento"
        accessibilityRole="button"
        className={isLast ? "flex-1" : "flex-1 pb-5"}
        onPress={() => onOpen(event)}
      >
        <View className="flex-row items-center justify-between gap-3">
          <Typography.Text className="flex-1" numberOfLines={1} semibold>
            {readableName(event)}
          </Typography.Text>
          <Display.Date
            className="text-text-tertiary"
            relative
            showTime={false}
            textVariant="caption"
            value={event.createdAt}
          />
        </View>
        <Typography.Text className="text-text-secondary" variant="caption">
          {`${eventStatusLabel(event.status)} · ${attempts}`}
        </Typography.Text>
      </Pressable>
    </View>
  );
}

export default memo(EventTimelineItem);
