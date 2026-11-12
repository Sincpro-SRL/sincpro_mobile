import { type Criteria, merge } from "@sincpro/criteria";
import type { EventRecord } from "@sincpro/mobile/domain/events";
import { CommandRetryEvents, commonBoundedContext } from "@sincpro/mobile/services";
import DeadLetterQueueRow from "@sincpro/mobile/ui/components/organisms/DeadLetterQueueRow";
import { EventActionSheet } from "@sincpro/mobile/ui/components/organisms/EventActionSheet";
import { EventListHeader } from "@sincpro/mobile/ui/events/event-query-controls";
import { useEventQuery } from "@sincpro/mobile/ui/events/use-event-query";
import { ListViewV2 } from "@sincpro/mobile-ui/views/ListViewV2";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

/** The retried event goes back to the queue; refresh once it had time to run. */
const RELOAD_AFTER_RETRY_MS = 5000;

const FAILED: Criteria<EventRecord> = {
  selection: { field: "state", operator: "=", value: "set_aside" },
};

export interface DeadLetterQueueListProps {
  /** Leaves the screen. Without it the header shows no back button. */
  onBack?: () => void;
  /** Screen title. */
  name?: string;
  /** Screen subtitle. */
  description?: string;
  /**
   * Which failed events this screen lists, read in SQL with the rest of its filters; all of them
   * by default. The app decides: `{ selection: { field: "name", operator: "=", value: … } }`.
   */
  scope?: Criteria<EventRecord>;
  /** What a row and its sheet call the event; its label by default. */
  eventTitle?: (event: EventRecord) => string;
  /** What the app shows of an event in its sheet, such as the image of a print. */
  renderDetail?: (event: EventRecord) => ReactNode;
  /** Shows event names and raw payloads; turn it off for people who are not debugging. */
  showTechnical?: boolean;
}

export default function DeadLetterQueueList({
  onBack,
  name = "Eventos fallidos",
  description = "Eventos que no pudieron ser procesados",
  scope,
  eventTitle,
  renderDetail,
  showTechnical = true,
}: DeadLetterQueueListProps) {
  const failed = useMemo(() => (scope ? merge<EventRecord>(FAILED, scope) : FAILED), [scope]);
  const list = useEventQuery(failed);
  const { reload } = list;
  const [selected, setSelected] = useState<EventRecord | null>(null);
  const [open, setOpen] = useState(false);
  const later = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(later.current), []);

  const openEvent = useCallback((event: EventRecord) => {
    setSelected(event);
    setOpen(true);
  }, []);
  const renderEvent = useCallback(
    (event: unknown) => (
      <DeadLetterQueueRow
        item={event as EventRecord}
        onOpen={openEvent}
        title={eventTitle?.(event as EventRecord)}
      />
    ),
    [eventTitle, openEvent],
  );
  const retry = useCallback(
    async (event: EventRecord) => {
      await commonBoundedContext.execute(new CommandRetryEvents([event]));
      await reload();
      // The event left the list: its sheet must not offer a second retry of the same failure.
      setOpen(false);
      clearTimeout(later.current);
      later.current = setTimeout(() => void reload(), RELOAD_AFTER_RETRY_MS);
    },
    [reload],
  );

  return (
    <ListViewV2.Root
      description={description}
      hasMore={list.hasMore}
      isLoading={list.isLoading}
      items={list.visible}
      name={name}
      onBack={onBack}
      onLoadMore={list.loadMore}
      onRefresh={reload}
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
