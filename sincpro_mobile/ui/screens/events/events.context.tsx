import { DomainEvent } from "@sincpro/mobile/domain/event_sourcing";
import { eventService } from "@sincpro/mobile/services/event.service";
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
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
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<EventFilter>("ALL");

  const filteredEvents = useMemo(() => {
    if (filter === "ALL") return events;
    return events.filter((ev) => {
      if (!ev.status) return false;
      if (filter === "FAILED") return ev.status === "FAILED";
      if (filter === "ACKNOWLEDGED") return ev.status === "ACKNOWLEDGED";
      if (filter === "PENDING") return ev.status === "PENDING";
      return true;
    });
  }, [events, filter]);

  const pagedEvents = useMemo(
    () => filteredEvents.slice(0, page * pageSize),
    [filteredEvents, page, pageSize],
  );
  const hasMore = pagedEvents.length < filteredEvents.length;

  const [prevFilter, setPrevFilter] = useState(filter);
  if (filter !== prevFilter) {
    setPrevFilter(filter);
    setPage(1);
  }

  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const fetched = await eventService.listAllEvents();
      setEvents(fetched);
      setPage(1);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshEvents = useCallback(async () => {
    await loadEvents();
  }, [loadEvents]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || isLoading || !hasMore) return;
    setIsLoadingMore(true);
    try {
      setPage((p) => p + 1);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoading, isLoadingMore]);

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
