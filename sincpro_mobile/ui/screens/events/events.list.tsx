import type { EventRecord } from "@sincpro/mobile/domain/events";
import { CommandResendEvent, commonBoundedContext } from "@sincpro/mobile/services";
import { EventActionSheet } from "@sincpro/mobile/ui/components/organisms/EventActionSheet";
import EventRow from "@sincpro/mobile/ui/components/organisms/EventRow";
import { EventListHeader } from "@sincpro/mobile/ui/events/event-query-controls";
import { useEventQuery } from "@sincpro/mobile/ui/events/use-event-query";
import { ListViewV2 } from "@sincpro/mobile-ui/views/ListViewV2";
import { useCallback, useState } from "react";

export interface EventsScreenProps {
  /** Leaves the screen. Without it the header shows no back button. */
  onBack?: () => void;
}

export default function EventsScreen({ onBack }: EventsScreenProps) {
  const list = useEventQuery();
  const { reload } = list;
  const [selected, setSelected] = useState<EventRecord | null>(null);
  const [open, setOpen] = useState(false);

  const openEvent = useCallback((event: EventRecord) => {
    setSelected(event);
    setOpen(true);
  }, []);
  const renderEvent = useCallback(
    (event: unknown) => <EventRow item={event as EventRecord} onOpen={openEvent} />,
    [openEvent],
  );
  const resend = useCallback(
    async (event: EventRecord) => {
      await commonBoundedContext.execute(new CommandResendEvent(event));
      await reload();
    },
    [reload],
  );

  return (
    <ListViewV2.Root
      description="Eventos registrados"
      hasMore={list.hasMore}
      isLoading={list.isLoading}
      items={list.visible}
      name="Eventos"
      onBack={onBack}
      onLoadMore={list.loadMore}
      onRefresh={reload}
    >
      <EventListHeader list={list} />
      <ListViewV2.Content>{renderEvent}</ListViewV2.Content>
      <EventActionSheet
        event={selected}
        onClose={() => setOpen(false)}
        onRetry={resend}
        visible={open}
      />
    </ListViewV2.Root>
  );
}
