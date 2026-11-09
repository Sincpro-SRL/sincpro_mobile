import { IntegrationEvent } from "@sincpro/mobile/domain/events";
import DeadLetterQueueRow from "@sincpro/mobile/ui/components/organisms/DeadLetterQueueRow";
import { EventActionSheet } from "@sincpro/mobile/ui/components/organisms/EventActionSheet";
import { EventListHeader } from "@sincpro/mobile/ui/events/event-query-controls";
import { useEventQuery } from "@sincpro/mobile/ui/events/use-event-query";
import { ListViewV2 } from "@sincpro/mobile-ui/views/ListViewV2";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DeadLetterQueueProvider, useDeadLetterQueue } from "./dead_letter_queue.context";

/** The retried event goes back to the queue; refresh once it had time to run. */
const RELOAD_AFTER_RETRY_MS = 5000;

export interface DeadLetterQueueListProps {
  /** Leaves the screen. Without it the header shows no back button. */
  onBack?: () => void;
  /** Screen title. */
  name?: string;
  /** Screen subtitle. */
  description?: string;
  /** Which failed events this screen lists; all of them by default. The app decides. */
  select?: (event: IntegrationEvent) => boolean;
  /** What a row and its sheet call the event; its label by default. */
  eventTitle?: (event: IntegrationEvent) => string;
  /** What the app shows of an event in its sheet, such as the image of a print. */
  renderDetail?: (event: IntegrationEvent) => ReactNode;
  /** Shows event names and raw payloads; turn it off for people who are not debugging. */
  showTechnical?: boolean;
}

function DeadLetterQueueScreenComponent({
  onBack,
  name = "Eventos fallidos",
  description = "Eventos que no pudieron ser procesados",
  select,
  eventTitle,
  renderDetail,
  showTechnical = true,
}: DeadLetterQueueListProps) {
  const { events, isLoading, loadEvents, retryEvent } = useDeadLetterQueue();
  const listed = useMemo(() => (select ? events.filter(select) : events), [events, select]);
  const list = useEventQuery(listed);
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
      <DeadLetterQueueRow
        item={event as IntegrationEvent}
        onOpen={openEvent}
        title={eventTitle?.(event as IntegrationEvent)}
      />
    ),
    [eventTitle, openEvent],
  );
  const retry = useCallback(
    async (event: IntegrationEvent) => {
      await retryEvent(event);
      // The event left the list: its sheet must not offer a second retry of the same failure.
      setOpen(false);
      clearTimeout(reload.current);
      reload.current = setTimeout(() => void loadEvents(), RELOAD_AFTER_RETRY_MS);
    },
    [loadEvents, retryEvent],
  );

  return (
    <ListViewV2.Root
      description={description}
      hasMore={list.hasMore}
      isLoading={isLoading}
      items={list.visible}
      name={name}
      onBack={onBack}
      onLoadMore={list.loadMore}
      onRefresh={loadEvents}
    >
      <EventListHeader list={list} showStatus={false} />
      <ListViewV2.Content>{renderEvent}</ListViewV2.Content>
      <EventActionSheet
        detail={selected && renderDetail ? renderDetail(selected) : null}
        event={selected}
        onClose={() => setOpen(false)}
        onRetry={retry}
        retryLabel="Reintentar"
        showTechnical={showTechnical}
        title={selected && eventTitle ? eventTitle(selected) : undefined}
        visible={open}
      />
    </ListViewV2.Root>
  );
}

function DeadLetterQueueList(props: DeadLetterQueueListProps) {
  return (
    <DeadLetterQueueProvider>
      <DeadLetterQueueScreenComponent {...props} />
    </DeadLetterQueueProvider>
  );
}

export default DeadLetterQueueList;
