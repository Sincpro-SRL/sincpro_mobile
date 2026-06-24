import { DomainEvent, EEventStatus } from "@sincpro/mobile/domain/event_sourcing";
import { Display } from "@sincpro/mobile-ui/Display";
import CopyableText from "@sincpro/mobile-ui/Display/Display.CopyableText";
import { theme } from "@sincpro/mobile-ui/theme";
import { Typography } from "@sincpro/mobile-ui/Typography";
import JsonPreview from "@sincpro/mobile-ui/widgets/JSONViewer";
import { useState } from "react";
import { TouchableOpacity, View } from "react-native";

const statusColorMap = {
  [EEventStatus.ACKNOWLEDGED]: {
    bg: "bg-success",
    color: theme.success,
    light: `${theme.success}4D`,
  },
  [EEventStatus.PENDING]: {
    bg: "bg-warning",
    color: theme.warning,
    light: `${theme.warning}4D`,
  },
  [EEventStatus.PROCESSING]: {
    bg: "bg-accent",
    color: theme.warning,
    light: `${theme.warning}4D`,
  },
  [EEventStatus.FAILED]: {
    bg: "bg-danger",
    color: theme.danger,
    light: `${theme.danger}4D`,
  },
} as const;

const defaultStatus = {
  bg: "bg-text-tertiary",
  color: theme.text.secondary,
  light: `${theme.text.secondary}4D`,
};

function getStatusColor(status: string) {
  return statusColorMap[status as keyof typeof statusColorMap] ?? defaultStatus;
}

function getStatusIcon(status: string): string {
  switch (status) {
    case EEventStatus.ACKNOWLEDGED:
      return "check-circle";
    case EEventStatus.PENDING:
      return "clock";
    case EEventStatus.PROCESSING:
      return "loader";
    case EEventStatus.FAILED:
      return "x-circle";
    default:
      return "circle";
  }
}

function formatEventName(name: string): string {
  const parts = name.split(".");
  return parts[parts.length - 1]?.replace(/_/g, " ").toUpperCase() || name;
}

interface EventTimelineItemProps {
  event: DomainEvent;
  isLast?: boolean;
}

function EventTimelineItem({ event, isLast = false }: EventTimelineItemProps) {
  const [expanded, setExpanded] = useState(false);
  const statusInfo = getStatusColor(event.status);
  const statusIcon = getStatusIcon(event.status);
  const friendlyName = formatEventName(event.name);

  return (
    <View className="flex-row px-4">
      <View className="items-center w-8 mr-3">
        <View className={`w-6 h-6 rounded-full items-center justify-center ${statusInfo.bg}`}>
          <Display.Icon color="#ffffff" name={statusIcon} size={12} type="feather" />
        </View>
        {!isLast && (
          <View className="w-0.5 flex-1 mt-1" style={{ backgroundColor: statusInfo.light }} />
        )}
      </View>

      <TouchableOpacity
        activeOpacity={0.7}
        className="flex-1 bg-bg-card rounded-xl p-3 mb-3 border border-border-light shadow-sm"
        onPress={() => setExpanded(!expanded)}
      >
        <View className="flex-row justify-between items-center mb-2">
          <Typography.Text semibold variant="body">
            {friendlyName}
          </Typography.Text>
          <Display.Icon
            color={theme.text.secondary}
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            type="feather"
          />
        </View>

        <View className="flex-row items-center mb-1 gap-1.5">
          <Display.Icon color={theme.text.secondary} name="clock" size={12} type="feather" />
          <Display.Date
            className="text-text-tertiary"
            showTime
            textVariant="caption"
            value={event.createdAt}
          />
        </View>

        <View className="flex-row items-center mb-1 gap-1.5">
          <Display.Icon color={statusInfo.color} name={statusIcon} size={12} type="feather" />
          <Typography.Text style={{ color: statusInfo.color }} variant="caption">
            {event.status} • Intentos: {event.attempts}
          </Typography.Text>
        </View>

        {(event.sequence ?? 0) > 0 && (
          <View className="flex-row items-center mb-1 gap-1.5">
            <Display.Icon color={theme.text.secondary} name="hash" size={12} type="feather" />
            <Typography.Text className="text-text-tertiary" variant="caption">
              Secuencia: {event.sequence}
            </Typography.Text>
          </View>
        )}

        {expanded && event && (
          <View className="mt-3 border-t border-border-light pt-3">
            <View className="flex-row justify-between items-center mb-2">
              <Typography.Text className="text-text-tertiary" semibold variant="caption">
                Payload
              </Typography.Text>
              <CopyableText
                className="text-primary text-xs"
                getValue={() => event.asJSON(true)}
                label={"copy"}
              />
            </View>
            <View className="bg-bg-muted rounded-lg border border-border-default overflow-hidden">
              <JsonPreview selectedJson={event.asJSON(true)} />
            </View>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default EventTimelineItem;
