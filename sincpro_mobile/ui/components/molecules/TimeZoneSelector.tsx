import { Actions } from "@sincpro/mobile-ui/Actions";
import { Display } from "@sincpro/mobile-ui/Display";
import { useTheme } from "@sincpro/mobile-ui/theme";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { useState } from "react";
import { View } from "react-native";

import { TimezoneLocale } from "./timezone";
import { TimeZoneSelectorModal } from "./TimeZoneSelectorModal";

interface TimeZoneSelectorProps {
  onSelect?: (tz: TimezoneLocale) => void;
  timezone?: string | null;
}

export function TimeZoneSelector({ onSelect, timezone }: TimeZoneSelectorProps) {
  const theme = useTheme();
  const [currentTimezone, setCurrentTimezone] = useState(timezone);
  const [selectorVisible, setSelectorVisible] = useState(false);

  function handleTimezoneSelected(tz: TimezoneLocale) {
    setCurrentTimezone(tz.timezone);
    onSelect?.(tz);
  }

  const displayTimezone = currentTimezone?.replace(/_/g, " ").replace("America/", "");

  return (
    <Display.Card className="my-2">
      <View className="flex-row items-center gap-3">
        <Display.Icon
          color={currentTimezone ? theme.info : theme.text.tertiary}
          name="time"
          size={24}
        />
        <View className="min-w-0 flex-1">
          <Typography.Text semibold>Zona horaria</Typography.Text>
          <Typography.Text className="text-text-secondary" variant="bodySmall">
            {currentTimezone ? displayTimezone : "Sin configurar"}
          </Typography.Text>
          {currentTimezone ? (
            <Typography.Text className="text-text-tertiary" variant="caption">
              {currentTimezone}
            </Typography.Text>
          ) : null}
        </View>
      </View>
      <Actions.Button
        className="mt-3"
        onPress={() => setSelectorVisible(true)}
        size="small"
        title={currentTimezone ? "Cambiar" : "Seleccionar"}
        variant={currentTimezone ? "outline" : "cta"}
      />

      <TimeZoneSelectorModal
        currentTimezone={currentTimezone}
        onClose={() => setSelectorVisible(false)}
        onSelect={handleTimezoneSelected}
        visible={selectorVisible}
      />
    </Display.Card>
  );
}
