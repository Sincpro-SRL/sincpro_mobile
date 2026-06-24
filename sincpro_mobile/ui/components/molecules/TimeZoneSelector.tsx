import { Display, Form } from "@sincpro/mobile-ui/index";
import { theme } from "@sincpro/mobile-ui/theme/useTheme";
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
  const [currentTimezone, setCurrentTimezone] = useState(timezone);
  const [selectorVisible, setSelectorVisible] = useState(false);

  function handleTimezoneSelected(tz: TimezoneLocale) {
    setCurrentTimezone(tz.timezone);
    onSelect?.(tz);
  }

  const displayTimezone = currentTimezone
    ? currentTimezone.replace(/_/g, " ").replace("America/", "")
    : "No configurada";

  return (
    <Display.Card className="my-2.5">
      <View className="flex-row items-start">
        <Display.Icon
          color={currentTimezone ? theme.info : theme.text.tertiary}
          name="schedule"
          size={35}
          type="material"
        />
        <View className="ml-2.5 flex-1">
          <Typography.Text className="text-base mb-1" semibold>
            Zona Horaria
          </Typography.Text>

          {currentTimezone ? (
            <View className="mt-2 bg-bg-card rounded-lg p-3">
              <Typography.Text className="text-text-primary" semibold>
                {displayTimezone}
              </Typography.Text>
              <Typography.Text className="text-text-tertiary text-xs">
                {currentTimezone}
              </Typography.Text>

              <View className="flex-row gap-2 mt-2">
                <Form.Button
                  onPress={() => setSelectorVisible(true)}
                  size="small"
                  title="Cambiar"
                  variant="outline"
                />
              </View>
            </View>
          ) : (
            <>
              <Typography.Text className="text-text-secondary mb-2">
                Selecciona una zona horaria
              </Typography.Text>
              <Form.Button
                onPress={() => setSelectorVisible(true)}
                size="small"
                title="Seleccionar Zona Horaria"
                variant="cta"
              />
            </>
          )}
        </View>
      </View>

      <TimeZoneSelectorModal
        currentTimezone={currentTimezone}
        onClose={() => setSelectorVisible(false)}
        onSelect={handleTimezoneSelected}
        visible={selectorVisible}
      />
    </Display.Card>
  );
}
