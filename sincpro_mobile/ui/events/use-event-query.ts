import type { CriteriaGroup } from "@sincpro/mobile-ui/utils/criteria";
import { useCallback, useDeferredValue, useMemo, useState } from "react";

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
  // The field shows each keystroke at once; filtering and the list follow at low
  // priority, so typing never waits for a 500-row filter and a list re-render.
  const searchedQuery = useDeferredValue(query);
  const [searching, setSearching] = useState(false);
  const [range, setRange] = useState<EventDateRange>("all");
  const [custom, setCustom] = useState<CriteriaGroup>(emptyCriteria);
  const [page, setPage] = useState(1);
  const customKey = useMemo(() => JSON.stringify(custom), [custom]);
  const signature = `${status}|${searchedQuery}|${range}|${customKey}`;
  const [seen, setSeen] = useState(signature);
  if (seen !== signature) {
    setSeen(signature);
    setPage(1);
  }

  const filtered = useMemo(
    () => filterEvents(events, { status, query: searchedQuery, range, custom }),
    [events, status, searchedQuery, range, custom],
  );
  const visible = useMemo(() => filtered.slice(0, page * PAGE_SIZE), [filtered, page]);

  const loadMore = useCallback(() => {
    setPage((current) => current + 1);
  }, []);
  const toggleSearch = useCallback(() => {
    setSearching((open) => !open);
  }, []);

  const hasMore = visible.length < filtered.length;
  return useMemo(
    () => ({
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
      hasMore,
      loadMore,
    }),
    [status, query, searching, toggleSearch, range, custom, visible, hasMore, loadMore],
  );
}
