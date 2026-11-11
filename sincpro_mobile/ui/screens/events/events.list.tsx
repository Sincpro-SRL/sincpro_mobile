import type { EventRecord } from "@sincpro/mobile/domain/events";
import { EventActionSheet } from "@sincpro/mobile/ui/components/organisms/EventActionSheet";
import EventRow from "@sincpro/mobile/ui/components/organisms/EventRow";
import { EventListHeader } from "@sincpro/mobile/ui/events/event-query-controls";
import { useEventQuery } from "@sincpro/mobile/ui/events/use-event-query";
import { ListViewV2 } from "@sincpro/mobile-ui/views/ListViewV2";
import { useCallback, useEffect, useState } from "react";

import { EventsProvider, useEvents } from "./events.context";

export interface EventsScreenProps {
  /** Leaves the screen. Without it the header shows no back button. */
  onBack?: () => void;
}

function EventsScreenComponent({ onBack }: EventsScreenProps) {
  const { events, isLoading, loadEvents, retryEvent } = useEvents();
  const list = useEventQuery(events);
  const [selected, setSelected] = useState<EventRecord | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const openEvent = useCallback((event: EventRecord) => {
    setSelected(event);
    setOpen(true);
  }, []);
  const renderEvent = useCallback(
    (event: unknown) => <EventRow item={event as EventRecord} onOpen={openEvent} />,
    [openEvent],
  );
  const retry = useCallback(
    async (event: EventRecord) => {
      await retryEvent(event);
    },
    [retryEvent],
  );

  return (
    <ListViewV2.Root
      description="Eventos registrados"
      hasMore={list.hasMore}
      isLoading={isLoading}
      items={list.visible}
      name="Eventos"
      onBack={onBack}
      onLoadMore={list.loadMore}
      onRefresh={loadEvents}
    >
      <EventListHeader list={list} />
      <ListViewV2.Content>{renderEvent}</ListViewV2.Content>
      <EventActionSheet
        event={selected}
        onClose={() => setOpen(false)}
        onRetry={retry}
        visible={open}
      />
    </ListViewV2.Root>
  );
}

export default function EventsScreen({ onBack }: EventsScreenProps) {
  return (
    <EventsProvider>
      <EventsScreenComponent onBack={onBack} />
    </EventsProvider>
  );
}
