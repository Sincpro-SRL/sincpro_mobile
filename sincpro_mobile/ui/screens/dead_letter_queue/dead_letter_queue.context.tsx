import { IntegrationEvent } from "@sincpro/mobile/domain/events";
import { deadLetterQueueUseCases } from "@sincpro/mobile/services/dead_letter_queue.service";
import { withCleanup } from "@sincpro/mobile/tools/utils/async";
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface IDeadLetterQueueContext {
  events: IntegrationEvent[];
  enrichedEvents: IntegrationEvent[];
  selectedEvents: Set<string>;
  isLoading: boolean;
  isRetrying: boolean;
  isDeleting: boolean;
  loadEvents: () => Promise<void>;
  /** False when the event was no longer failed: someone else already retried it. */
  retryEvent: (event: IntegrationEvent) => Promise<boolean>;
  retrySelectedEvents: () => Promise<{ success: number; failed: number }>;
  deleteEvent: (event: IntegrationEvent) => Promise<void>;
  deleteSelectedEvents: () => Promise<{ success: number; failed: number }>;
  toggleSelection: (eventId: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  // pagination
  loadMore: () => Promise<void>;
  hasMore: boolean;
  page: number;
  pageSize: number;
  isLoadingMore: boolean;
}

const DeadLetterQueueContext = createContext<IDeadLetterQueueContext | null>(null);

export function DeadLetterQueueProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<IntegrationEvent[]>([]);
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [pagedEvents, setPagedEvents] = useState<IntegrationEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const paginate = useCallback(
    (list: IntegrationEvent[], nextPage: number) => {
      const slice = list.slice(0, nextPage * pageSize);
      setPagedEvents(slice);
      setHasMore(slice.length < list.length);
      setPage(nextPage);
    },
    [pageSize],
  );

  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    return withCleanup(
      async () => {
        const fetched = await deadLetterQueueUseCases.getFailedEvents();
        setEvents(fetched);
        setSelectedEvents(new Set());
        paginate(fetched, 1);
      },
      () => setIsLoading(false),
    );
  }, [paginate]);

  const retryEvent = useCallback(
    async (event: IntegrationEvent) => {
      setIsRetrying(true);
      return withCleanup(
        async () => {
          const retried = await deadLetterQueueUseCases.retryFailedEvent(event);
          await loadEvents();
          return retried;
        },
        () => setIsRetrying(false),
      );
    },
    [loadEvents],
  );

  const loadMore = useCallback(async () => {
    if (isLoadingMore || isLoading || !hasMore) return;
    setIsLoadingMore(true);
    return withCleanup(
      () => {
        paginate(events, page + 1);
      },
      () => setIsLoadingMore(false),
    );
  }, [events, hasMore, isLoading, isLoadingMore, page, paginate]);

  const retrySelectedEvents = useCallback(async () => {
    if (selectedEvents.size === 0) {
      return { success: 0, failed: 0 };
    }
    setIsRetrying(true);
    return withCleanup(
      async () => {
        const eventsToRetry = events.filter((event) => selectedEvents.has(event.uuid));
        const result = await deadLetterQueueUseCases.retryMultipleFailedEvents(eventsToRetry);
        await loadEvents();
        return result;
      },
      () => setIsRetrying(false),
    );
  }, [events, selectedEvents, loadEvents]);

  const deleteEvent = useCallback(
    async (event: IntegrationEvent) => {
      setIsDeleting(true);
      return withCleanup(
        async () => {
          await deadLetterQueueUseCases.deleteFailedEvent(event);
          await loadEvents();
        },
        () => setIsDeleting(false),
      );
    },
    [loadEvents],
  );

  const deleteSelectedEvents = useCallback(async () => {
    if (selectedEvents.size === 0) {
      return { success: 0, failed: 0 };
    }
    setIsDeleting(true);
    return withCleanup(
      async () => {
        const eventsToDelete = events.filter((event) => selectedEvents.has(event.uuid));
        const result =
          await deadLetterQueueUseCases.deleteMultipleFailedEvents(eventsToDelete);
        await loadEvents();
        return result;
      },
      () => setIsDeleting(false),
    );
  }, [events, selectedEvents, loadEvents]);

  const toggleSelection = useCallback((eventId: string) => {
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedEvents(new Set(events.map((event) => event.uuid)));
  }, [events]);

  const clearSelection = useCallback(() => {
    setSelectedEvents(new Set());
  }, []);

  const enrichedEvents = useMemo(() => {
    return pagedEvents || [];
  }, [pagedEvents]);

  const value = useMemo<IDeadLetterQueueContext>(
    () => ({
      events,
      enrichedEvents,
      selectedEvents,
      isLoading,
      isRetrying,
      isDeleting,
      loadEvents,
      retryEvent,
      retrySelectedEvents,
      deleteEvent,
      deleteSelectedEvents,
      toggleSelection,
      selectAll,
      clearSelection,
      // Pagination
      loadMore,
      hasMore,
      page,
      pageSize,
      isLoadingMore,
    }),
    [
      events,
      enrichedEvents,
      selectedEvents,
      isLoading,
      isRetrying,
      isDeleting,
      loadEvents,
      retryEvent,
      retrySelectedEvents,
      deleteEvent,
      deleteSelectedEvents,
      toggleSelection,
      selectAll,
      clearSelection,
      loadMore,
      hasMore,
      page,
      pageSize,
      isLoadingMore,
    ],
  );

  return (
    <DeadLetterQueueContext.Provider value={value}>
      {children}
    </DeadLetterQueueContext.Provider>
  );
}

export function useDeadLetterQueue() {
  const context = useContext(DeadLetterQueueContext);
  if (!context) {
    throw new Error("useDeadLetterQueue must be used within DeadLetterQueueProvider");
  }
  return context;
}
