import { useNavigation } from "@react-navigation/native";
import { DomainEvent } from "@sincpro/mobile/domain/event_sourcing";
import EventRow from "@sincpro/mobile/ui/components/organisms/EventRow";
import { ListViewV2 } from "@sincpro/mobile-ui/views/ListViewV2";
import { useEffect } from "react";

import { EventsProvider, useEvents } from "./events.context";

type FilterValue = "ALL" | "FAILED" | "ACKNOWLEDGED" | "PENDING";

const FILTER_OPTIONS: { label: string; value: FilterValue }[] = [
  { label: "Todos", value: "ALL" },
  { label: "Fallidos", value: "FAILED" },
  { label: "Reconocidos", value: "ACKNOWLEDGED" },
  { label: "Pendientes", value: "PENDING" },
];

function EventsScreenComponent() {
  const navigation = useNavigation();
  const { pagedEvents, isLoading, loadEvents, retryEvent, filter, setFilter } = useEvents();

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const onBack = () => navigation.goBack();

  return (
    <ListViewV2.Root
      description="Eventos registrados"
      isLoading={isLoading}
      items={pagedEvents}
      name="Eventos"
      onBack={onBack}
      onRefresh={loadEvents}
    >
      <ListViewV2.Header variant="default">
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
