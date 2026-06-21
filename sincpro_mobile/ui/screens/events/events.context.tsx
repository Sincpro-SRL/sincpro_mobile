import { DomainEvent } from "@sincpro/mobile/domain/event_sourcing";
import { eventService } from "@sincpro/mobile/services/event.service";
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type EventFilter = "ALL" | "FAILED" | "ACKNOWLEDGED" | "PENDING";

interface IEventsContext {
  events: DomainEvent[];
  pagedEvents: DomainEvent[];
  isLoading: boolean;
  isLoadingMore: boolean;
  isRetrying: boolean;
  hasMore: boolean;
  page: number;
  pageSize: number;
  filter: EventFilter;
  setFilter: (filter: EventFilter) => void;
  loadEvents: () => Promise<void>;
  refreshEvents: () => Promise<void>;
  loadMore: () => Promise<void>;
  retryEvent: (event: DomainEvent) => Promise<void>;
}

const EventsContext = createContext<IEventsContext | null>(null);

export function EventsProvider({
  children,
  pageSize = 25,
}: {
  children: ReactNode;
  pageSize?: number;
}) {
  const [events, setEvents] = useState<DomainEvent[]>([]);
  const [pagedEvents, setPagedEvents] = useState<DomainEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<EventFilter>("ALL");

  const filterEvents = useCallback((list: DomainEvent[], currentFilter: EventFilter) => {
    if (currentFilter === "ALL") return list;
    return list.filter((ev) => {
      if (!ev.status) return false;
      if (currentFilter === "FAILED") return ev.status === "FAILED";
      if (currentFilter === "ACKNOWLEDGED") return ev.status === "ACKNOWLEDGED";
      if (currentFilter === "PENDING") return ev.status === "PENDING";
      return true;
    });
  }, []);

  const paginate = useCallback(
    (list: DomainEvent[], nextPage: number, currentFilter: EventFilter) => {
      const filtered = filterEvents(list, currentFilter);
      const slice = filtered.slice(0, nextPage * pageSize);
      setPagedEvents(slice);
      setHasMore(slice.length < filtered.length);
      setPage(nextPage);
    },
    [filterEvents, pageSize],
  );

  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const fetched = await eventService.listAllEvents();
      setEvents(fetched);
      paginate(fetched, 1, filter);
    } finally {
      setIsLoading(false);
    }
  }, [filter, paginate]);

  const refreshEvents = useCallback(async () => {
    await loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    paginate(events, 1, filter);
  }, [events, filter, paginate]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || isLoading || !hasMore) return;
    setIsLoadingMore(true);
    try {
      paginate(events, page + 1, filter);
    } finally {
      setIsLoadingMore(false);
    }
  }, [events, hasMore, isLoading, isLoadingMore, page, paginate, filter]);

  const retryEvent = useCallback(
    async (event: DomainEvent) => {
      setIsRetrying(true);
      try {
        await eventService.republishSync(event);
        await refreshEvents();
      } finally {
        setIsRetrying(false);
      }
    },
    [refreshEvents],
  );

  const value = useMemo<IEventsContext>(
    () => ({
      events,
      pagedEvents,
      isLoading,
      isLoadingMore,
      isRetrying,
      hasMore,
      page,
      pageSize,
      filter,
      setFilter,
      loadEvents,
      refreshEvents,
      loadMore,
      retryEvent,
    }),
    [
      events,
      pagedEvents,
      isLoading,
      isLoadingMore,
      isRetrying,
      hasMore,
      page,
      pageSize,
      filter,
      setFilter,
      loadEvents,
      refreshEvents,
      loadMore,
      retryEvent,
    ],
  );

  return <EventsContext.Provider value={value}>{children}</EventsContext.Provider>;
}

export function useEvents() {
  const context = useContext(EventsContext);
  if (!context) {
    throw new Error("useEvents must be used within EventsProvider");
  }
  return context;
}
