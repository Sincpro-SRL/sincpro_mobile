import { useNavigation } from "@react-navigation/native";
import { DomainEvent } from "@sincpro/mobile/domain/event_sourcing";
import DeadLetterQueueRow from "@sincpro/mobile/ui/components/organisms/DeadLetterQueueRow";
import { ListViewV2 } from "@sincpro/mobile-ui/views/ListViewV2";
import { useEffect } from "react";

import { DeadLetterQueueProvider, useDeadLetterQueue } from "./dead_letter_queue.context";

function DeadLetterQueueScreenComponent() {
  const navigation = useNavigation();
  const { enrichedEvents, isLoading, loadEvents, retryEvent } = useDeadLetterQueue();

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const onBack = () => navigation.goBack();

  return (
    <ListViewV2.Root
      description="Eventos que no pudieron ser procesados"
      isLoading={isLoading}
      items={enrichedEvents}
      name="Eventos fallidos"
      onBack={onBack}
      onRefresh={loadEvents}
    >
      <ListViewV2.Header variant="default" />

      <ListViewV2.Content>
        {(event: DomainEvent) => (
          <DeadLetterQueueRow
            item={event}
            onRetry={async (evt) => {
              await retryEvent(evt as DomainEvent);
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
