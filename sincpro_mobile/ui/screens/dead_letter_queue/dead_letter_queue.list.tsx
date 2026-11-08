import { IntegrationEvent } from "@sincpro/mobile/domain/events";
import DeadLetterQueueRow from "@sincpro/mobile/ui/components/organisms/DeadLetterQueueRow";
import { EventActionSheet } from "@sincpro/mobile/ui/components/organisms/EventActionSheet";
import { EventListHeader } from "@sincpro/mobile/ui/events/event-query-controls";
import { useEventQuery } from "@sincpro/mobile/ui/events/use-event-query";
import { ListViewV2 } from "@sincpro/mobile-ui/views/ListViewV2";
import { useCallback, useEffect, useRef, useState } from "react";

import { DeadLetterQueueProvider, useDeadLetterQueue } from "./dead_letter_queue.context";

/** The retried event goes back to the queue; refresh once it had time to run. */
const RELOAD_AFTER_RETRY_MS = 5000;

export interface DeadLetterQueueListProps {
  /** Leaves the screen. Without it the header shows no back button. */
  onBack?: () => void;
}

function DeadLetterQueueScreenComponent({ onBack }: DeadLetterQueueListProps) {
  const { events, isLoading, loadEvents, retryEvent } = useDeadLetterQueue();
  const list = useEventQuery(events);
  const [selected, setSelected] = useState<IntegrationEvent | null>(null);
  const [open, setOpen] = useState(false);
  const reload = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    loadEvents();
    return () => clearTimeout(reload.current);
  }, [loadEvents]);

  const openEvent = useCallback((event: IntegrationEvent) => {
    setSelected(event);
    setOpen(true);
  }, []);
  const renderEvent = useCallback(
    (event: unknown) => (
      <DeadLetterQueueRow item={event as IntegrationEvent} onOpen={openEvent} />
    ),
    [openEvent],
  );
  const retry = useCallback(
    async (event: IntegrationEvent) => {
      await retryEvent(event);
      clearTimeout(reload.current);
      reload.current = setTimeout(() => void loadEvents(), RELOAD_AFTER_RETRY_MS);
    },
    [loadEvents, retryEvent],
  );

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
      <ListViewV2.Content>{renderEvent}</ListViewV2.Content>
      <EventActionSheet
        event={selected}
        onClose={() => setOpen(false)}
        onRetry={retry}
        retryLabel="Reintentar"
        visible={open}
      />
    </ListViewV2.Root>
  );
}

function DeadLetterQueueList({ onBack }: DeadLetterQueueListProps) {
  return (
    <DeadLetterQueueProvider>
      <DeadLetterQueueScreenComponent onBack={onBack} />
    </DeadLetterQueueProvider>
  );
}

export default DeadLetterQueueList;
