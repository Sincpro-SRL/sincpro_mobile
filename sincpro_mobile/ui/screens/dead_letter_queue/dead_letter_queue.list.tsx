import { useNavigation } from "@react-navigation/native";
import { IntegrationEvent } from "@sincpro/mobile/domain/events";
import DeadLetterQueueRow from "@sincpro/mobile/ui/components/organisms/DeadLetterQueueRow";
import { EventListHeader } from "@sincpro/mobile/ui/events/event-query-controls";
import { useEventQuery } from "@sincpro/mobile/ui/events/use-event-query";
import { ListViewV2 } from "@sincpro/mobile-ui/views/ListViewV2";
import { useEffect } from "react";

import { DeadLetterQueueProvider, useDeadLetterQueue } from "./dead_letter_queue.context";

function DeadLetterQueueScreenComponent() {
  const navigation = useNavigation();
  const { events, isLoading, loadEvents, retryEvent } = useDeadLetterQueue();
  const list = useEventQuery(events);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const onBack = () => navigation.goBack();

  return (
    <ListViewV2.Root
      description="Eventos que no pudieron ser procesados"
      hasMore={list.hasMore}
      isLoading={isLoading}
      items={list.visible}
      name="Eventos fallidos"
      onBack={onBack}
      onLoadMore={list.loadMore}
      onRefresh={loadEvents}
    >
      <EventListHeader list={list} showStatus={false} />

      <ListViewV2.Content>
        {(event: IntegrationEvent) => (
          <DeadLetterQueueRow
            item={event}
            onRetry={async (evt) => {
              await retryEvent(evt as IntegrationEvent);
              setTimeout(() => {
                void loadEvents();
              }, 5000);
            }}
          />
        )}
      </ListViewV2.Content>
    </ListViewV2.Root>
  );
}

function DeadLetterQueueList() {
  return (
    <DeadLetterQueueProvider>
      <DeadLetterQueueScreenComponent />
    </DeadLetterQueueProvider>
  );
}

export default DeadLetterQueueList;
