import type { CriteriaGroup } from "@sincpro/mobile-ui/utils/criteria";
import { useCallback, useMemo, useState } from "react";

import {
  emptyCriteria,
  type EventDateRange,
  type EventListItem,
  type EventStatusFilter,
  filterEvents,
} from "./filter-events";

const PAGE_SIZE = 25;

export function useEventQuery<T extends EventListItem>(events: readonly T[]) {
  const [status, setStatus] = useState<EventStatusFilter>("ALL");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [range, setRange] = useState<EventDateRange>("all");
  const [custom, setCustom] = useState<CriteriaGroup>(emptyCriteria);
  const [page, setPage] = useState(1);
  const signature = `${status}|${query}|${range}|${JSON.stringify(custom)}`;
  const [seen, setSeen] = useState(signature);
  if (seen !== signature) {
    setSeen(signature);
    setPage(1);
  }

  const filtered = useMemo(
    () => filterEvents(events, { status, query, range, custom }),
    [events, status, query, range, custom],
  );
  const visible = filtered.slice(0, page * PAGE_SIZE);

  const loadMore = useCallback(() => {
    setPage((current) => current + 1);
  }, []);
  const toggleSearch = useCallback(() => {
    setSearching((open) => !open);
  }, []);

  return {
    status,
    setStatus,
    query,
    setQuery,
    searching,
    toggleSearch,
    range,
    setRange,
    custom,
    setCustom,
    visible,
    hasMore: visible.length < filtered.length,
    loadMore,
  };
}
