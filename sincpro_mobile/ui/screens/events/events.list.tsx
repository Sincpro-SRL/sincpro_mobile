import { ListViewV2 } from "@sincpro/mobile-ui/views/ListViewV2";
import { EVariantScreenHeader } from "@sincpro/mobile-ui/widgets/ScreenHeader";
import { useEffect } from "react";
import { useNavigate } from "react-router-native";

import { DomainEvent } from "../../../domain/event";
import EventRow from "../../components/organisms/EventRow";
import { EventsProvider, useEvents } from "./events.context";

type FilterValue = "ALL" | "FAILED" | "ACKNOWLEDGED" | "PENDING";

const FILTER_OPTIONS: { label: string; value: FilterValue }[] = [
  { label: "Todos", value: "ALL" },
  { label: "Fallidos", value: "FAILED" },
  { label: "Reconocidos", value: "ACKNOWLEDGED" },
  { label: "Pendientes", value: "PENDING" },
];

function EventsScreenComponent() {
  const navigate = useNavigate();
  const { pagedEvents, isLoading, loadEvents, retryEvent, filter, setFilter } = useEvents();

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const onBack = () => navigate(-1);

  return (
    <ListViewV2.Root
      description="Eventos registrados"
      isLoading={isLoading}
      items={pagedEvents}
      name="Eventos"
      onBack={onBack}
      onRefresh={loadEvents}
    >
      <ListViewV2.Header variant={EVariantScreenHeader.FLAT_HEADER}>
        <ListViewV2.Header.Filters>
          <ListViewV2.Header.Filters.Chips>
            {FILTER_OPTIONS.map((option) => (
              <ListViewV2.Header.Filters.Chip
                active={filter === option.value}
                key={option.value}
                label={option.label}
                onPress={() => setFilter(option.value as any)}
              />
            ))}
          </ListViewV2.Header.Filters.Chips>
        </ListViewV2.Header.Filters>
      </ListViewV2.Header>

      <ListViewV2.Content>
        {(event: any) => (
          <EventRow
            item={event}
            onRetry={async (evt) => {
              await retryEvent(evt as DomainEvent);
            }}
          />
        )}
      </ListViewV2.Content>
    </ListViewV2.Root>
  );
}

export default function EventsScreen() {
  return (
    <EventsProvider>
      <EventsScreenComponent />
    </EventsProvider>
  );
}
