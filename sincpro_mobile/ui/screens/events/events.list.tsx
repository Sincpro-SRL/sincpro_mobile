import { useNavigation } from "@react-navigation/native";
import { IntegrationEvent } from "@sincpro/mobile/domain/events";
import EventRow from "@sincpro/mobile/ui/components/organisms/EventRow";
import { EventListHeader } from "@sincpro/mobile/ui/events/event-query-controls";
import { useEventQuery } from "@sincpro/mobile/ui/events/use-event-query";
import { ListViewV2 } from "@sincpro/mobile-ui/views/ListViewV2";
import { useEffect } from "react";

import { EventsProvider, useEvents } from "./events.context";

function EventsScreenComponent() {
  const navigation = useNavigation();
  const { events, isLoading, loadEvents, retryEvent } = useEvents();
  const list = useEventQuery(events);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  return (
    <ListViewV2.Root
      description="Eventos registrados"
      hasMore={list.hasMore}
      isLoading={isLoading}
      items={list.visible}
      name="Eventos"
      onBack={() => navigation.goBack()}
      onLoadMore={list.loadMore}
      onRefresh={loadEvents}
    >
      <EventListHeader list={list} />

      <ListViewV2.Content>
        {(event) => (
          <EventRow
            item={event as IntegrationEvent}
            onRetry={async (evt) => {
              await retryEvent(evt);
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
