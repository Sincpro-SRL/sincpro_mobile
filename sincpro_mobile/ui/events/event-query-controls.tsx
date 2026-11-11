import { Actions } from "@sincpro/mobile-ui/Actions";
import Sheet from "@sincpro/mobile-ui/Dialog/Sheet";
import KeyboardForm from "@sincpro/mobile-ui/Form/Form.KeyboardForm";
import { Navigation } from "@sincpro/mobile-ui/Navigation";
import { Pressable } from "@sincpro/mobile-ui/primitives/Pressable";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { type CriteriaGroup, describeCriteria } from "@sincpro/mobile-ui/utils/criteria";
import { ListViewV2 } from "@sincpro/mobile-ui/views/ListViewV2";
import FilterBuilder from "@sincpro/mobile-ui/widgets/FilterBuilder";
import { type ReactNode, useState } from "react";
import { View } from "react-native";

import {
  countConditions,
  emptyCriteria,
  EVENT_FIELDS,
  type EventDateRange,
  type EventStatusFilter,
} from "./filter-events";

const STATUS_FILTERS: { label: string; value: EventStatusFilter }[] = [
  { label: "Todos", value: "ALL" },
  { label: "Pendientes", value: "pending" },
  { label: "Entregados", value: "delivered" },
  { label: "Fallidos", value: "set_aside" },
];

const DATE_FILTERS: { label: string; value: EventDateRange }[] = [
  { label: "Todas", value: "all" },
  { label: "Hoy", value: "today" },
  { label: "7 días", value: "week" },
  { label: "30 días", value: "month" },
];

type FilterTab = "status" | "date" | "custom";

export interface EventListQuery {
  status: EventStatusFilter;
  setStatus: (status: EventStatusFilter) => void;
  range: EventDateRange;
  setRange: (range: EventDateRange) => void;
  query: string;
  setQuery: (query: string) => void;
  searching: boolean;
  toggleSearch: () => void;
  custom: CriteriaGroup;
  setCustom: (custom: CriteriaGroup) => void;
}

export function EventSearchButton({
  active,
  onPress,
}: {
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Navigation.AppBar.Action
      accessibilityLabel={active ? "Cerrar búsqueda" : "Buscar"}
      icon="search"
      onPress={onPress}
      tone={active ? "tinted" : "plain"}
    />
  );
}

/** The search of the events list: the same pill search as every list header. */
function NameSearch({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View className="pb-2">
      <Navigation.SearchBar
        accessibilityLabel="Buscar por nombre"
        autoFocus
        onChangeText={onChangeText}
        placeholder="Nombre o nombre técnico"
        value={value}
      />
    </View>
  );
}

function ChipRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <ListViewV2.Header.Filters.Chips>
      {options.map((option) => (
        <ListViewV2.Header.Filters.Chip
          active={value === option.value}
          key={option.value}
          label={option.label}
          onPress={() => onChange(option.value)}
        />
      ))}
    </ListViewV2.Header.Filters.Chips>
  );
}

function CustomFilter({
  value,
  onApply,
}: {
  value: CriteriaGroup;
  onApply: (value: CriteriaGroup) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  // While a condition is half-edited, Limpiar/Aplicar stay hidden: the builder
  // saves or cancels it first, so a draft never applies an unvalidated condition.
  const [editing, setEditing] = useState(false);
  const summary = describeCriteria(value, EVENT_FIELDS);

  const apply = () => {
    onApply(draft);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        className="flex-row items-center gap-3 py-1"
        onPress={() => {
          setDraft(value);
          setOpen(true);
        }}
      >
        <Typography.Text
          className="flex-1 text-text-secondary"
          numberOfLines={1}
          variant="caption"
        >
          {summary}
        </Typography.Text>
        <Typography.Text className="text-text-accent" variant="caption">
          {countConditions(value) ? "Editar" : "Armar"}
        </Typography.Text>
      </Pressable>
      <Sheet
        onClose={() => setOpen(false)}
        scrollable={false}
        snapPoints={["58%", "88%"]}
        title="Filtro custom"
        visible={open}
      >
        <KeyboardForm contentContainerStyle={{ paddingBottom: 16 }}>
          <FilterBuilder
            fields={EVENT_FIELDS}
            onChange={setDraft}
            onEditingChange={setEditing}
            value={draft}
          />
          {editing ? null : (
            <View className="flex-row gap-3 pt-2">
              <View className="flex-1">
                <Actions.Button
                  onPress={() => setDraft(emptyCriteria())}
                  title="Limpiar"
                  variant="secondary"
                />
              </View>
              <View className="flex-1">
                <Actions.Button onPress={apply} title="Aplicar" />
              </View>
            </View>
          )}
        </KeyboardForm>
      </Sheet>
    </>
  );
}

export function EventListHeader({
  list,
  showStatus = true,
  extraActions,
}: {
  list: EventListQuery;
  showStatus?: boolean;
  extraActions?: ReactNode;
}) {
  const [tab, setTab] = useState<FilterTab>(showStatus ? "status" : "date");
  const customCount = countConditions(list.custom);
  const options = [
    ...(showStatus ? [{ label: "Estado", value: "status" as const }] : []),
    { label: "Fecha", value: "date" as const },
    { label: customCount ? `Custom ${customCount}` : "Custom", value: "custom" as const },
  ];

  return (
    <ListViewV2.Header
      actions={
        <>
          {extraActions}
          <EventSearchButton
            active={list.searching || list.query.length > 0}
            onPress={list.toggleSearch}
          />
        </>
      }
      variant="default"
    >
      {list.searching ? <NameSearch onChangeText={list.setQuery} value={list.query} /> : null}
      <ListViewV2.Header.Segmented
        accessibilityLabel="Tipo de filtro"
        onChange={setTab}
        options={options}
        value={tab}
      />
      {tab === "status" ? (
        <ChipRow onChange={list.setStatus} options={STATUS_FILTERS} value={list.status} />
      ) : null}
      {tab === "date" ? (
        <ChipRow onChange={list.setRange} options={DATE_FILTERS} value={list.range} />
      ) : null}
      {tab === "custom" ? (
        <CustomFilter onApply={list.setCustom} value={list.custom} />
      ) : null}
    </ListViewV2.Header>
  );
}
