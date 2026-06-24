import Sheet from "@sincpro/mobile-ui/Dialog/Sheet";
import { Display, Form } from "@sincpro/mobile-ui/index";
import { theme } from "@sincpro/mobile-ui/theme";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { useMemo, useState } from "react";
import { TextInput, TouchableOpacity, View } from "react-native";

import { TimezoneLocale } from "./timezone";

interface TimeZoneSelectorModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (tz: TimezoneLocale) => void;
  currentTimezone?: string | null;
}

const TIMEZONES_LOCALES: Record<string, TimezoneLocale> = {
  bolivia: { timezone: "America/La_Paz", locale: "es-BO" },
  costaRica: { timezone: "America/Costa_Rica", locale: "es-CR" },
  guatemala: { timezone: "America/Guatemala", locale: "es-GT" },
  argentina: { timezone: "America/Argentina/Buenos_Aires", locale: "es-AR" },
  peru: { timezone: "America/Lima", locale: "es-PE" },
  newYork: { timezone: "America/New_York", locale: "en-US" },
  japon: { timezone: "Asia/Tokyo", locale: "ja-JP" },
};

interface TimezoneItem extends TimezoneLocale {
  label: string;
}

function TimezoneRow({
  item,
  isSelected,
  onSelect,
}: {
  item: TimezoneItem;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      className={`flex-row items-center p-4 rounded-xl ${
        isSelected ? "bg-bg-accent" : "bg-bg-card"
      }`}
      onPress={onSelect}
    >
      <Display.Icon
        color={isSelected ? theme.accent : theme.text.secondary}
        name="schedule"
        size={24}
        type="material"
      />
      <View className="ml-3 flex-1">
        <Typography.Text semibold>{item.label}</Typography.Text>
        <Typography.Text className="text-text-tertiary text-xs">
          {item.locale}
        </Typography.Text>
      </View>
      {isSelected && (
        <View className="w-6 h-6 rounded-full bg-accent items-center justify-center">
          <Display.Icon color={theme.text.inverse} name="check" size={16} type="material" />
        </View>
      )}
    </TouchableOpacity>
  );
}

function EmptyState() {
  return (
    <View className="p-8 items-center justify-center" style={{ minHeight: 200 }}>
      <Display.Icon color={theme.text.tertiary} name="search-off" size={48} type="material" />
      <Typography.Text className="text-text-secondary text-center mt-4">
        {"No se encontraron zonas horarias"}
      </Typography.Text>
    </View>
  );
}

function TimeZoneSelectorModal({
  visible,
  onClose,
  onSelect,
  currentTimezone,
}: TimeZoneSelectorModalProps) {
  const [query, setQuery] = useState("");
  const [selectedTimezone, setSelectedTimezone] = useState<string | null>(
    currentTimezone || null,
  );

  const timezoneList = useMemo<TimezoneItem[]>(() => {
    return Object.values(TIMEZONES_LOCALES).map((tz) => ({
      ...tz,
      label: tz.timezone.replace(/_/g, " ").replace("America/", ""),
    }));
  }, []);

  const filteredTimezones = useMemo(() => {
    if (!query.trim()) return timezoneList;

    const normalizedQuery = query
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    return timezoneList.filter(({ label, timezone }) => {
      const normalizedLabel = label
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      const normalizedTz = timezone.toLowerCase();
      return (
        normalizedLabel.includes(normalizedQuery) || normalizedTz.includes(normalizedQuery)
      );
    });
  }, [query, timezoneList]);

  function handleConfirm() {
    const selected = timezoneList.find((tz) => tz.timezone === selectedTimezone);
    if (selected) {
      onSelect({ timezone: selected.timezone, locale: selected.locale });
      onClose();
    }
  }

  return (
    <Sheet onClose={onClose} title="Zona Horaria" visible={visible}>
      <Typography.Text className="text-text-secondary text-xs mb-3">
        Selecciona tu zona horaria
      </Typography.Text>
      <TextInput
        className="bg-bg-muted px-4 py-3 rounded-xl mb-2"
        onChangeText={setQuery}
        placeholder="Buscar zona horaria..."
        placeholderTextColor={theme.text.tertiary}
        value={query}
      />

      {filteredTimezones.length === 0 ? (
        <EmptyState />
      ) : (
        <View className="gap-1">
          {filteredTimezones.map((item) => (
            <TimezoneRow
              isSelected={selectedTimezone === item.timezone}
              item={item}
              key={item.timezone}
              onSelect={() => setSelectedTimezone(item.timezone)}
            />
          ))}
        </View>
      )}

      <View className="flex-row gap-2 mt-4">
        <View className="flex-1">
          <Form.Button onPress={onClose} title="Cancelar" variant="outline" />
        </View>
        {selectedTimezone ? (
          <View className="flex-1">
            <Form.Button onPress={handleConfirm} title="Confirmar" variant="cta" />
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

export { TimeZoneSelectorModal };
