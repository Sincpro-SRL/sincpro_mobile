import { DomainEvent } from "@sincpro/mobile/domain/event";
import DeadLetterQueueRow from "@sincpro/mobile/ui/components/organisms/DeadLetterQueueRow";
import { ListViewV2 } from "@sincpro/mobile-ui/views/ListViewV2";
import { EVariantScreenHeader } from "@sincpro/mobile-ui/widgets/ScreenHeader";
import { useEffect } from "react";
import { useNavigate } from "react-router-native";

import { DeadLetterQueueProvider, useDeadLetterQueue } from "./dead_letter_queue.context";

function DeadLetterQueueScreenComponent() {
  const navigate = useNavigate();
  const { enrichedEvents, isLoading, loadEvents, retryEvent } = useDeadLetterQueue();

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const onBack = () => navigate(-1);

  return (
    <ListViewV2.Root
      description="Eventos que no pudieron ser procesados"
      isLoading={isLoading}
      items={enrichedEvents}
      name="Eventos fallidos"
      onBack={onBack}
      onRefresh={loadEvents}
    >
      <ListViewV2.Header variant={EVariantScreenHeader.FLAT_HEADER} />

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
