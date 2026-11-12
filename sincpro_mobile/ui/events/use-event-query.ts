import { type Criteria, merge, type Resource, resource } from "@sincpro/criteria";
import { useReading } from "@sincpro/criteria-react";
import type { EventRecord } from "@sincpro/mobile/domain/events";
import { CommandSearchEvents, commonBoundedContext } from "@sincpro/mobile/services";
import type { CriteriaGroup } from "@sincpro/mobile-ui/utils/criteria";
import { useCallback, useDeferredValue, useMemo, useState } from "react";

import {
  emptyCriteria,
  eventCriteria,
  type EventDateRange,
  type EventStatusFilter,
} from "./filter-events";

const PAGE_SIZE = 25;

const storedEvents = resource<EventRecord>((criteria) =>
  commonBoundedContext.execute(new CommandSearchEvents(criteria)),
);

/**
 * The stored events a screen lists, as the person filters them: every filter is one criteria,
 * read in SQL a page at a time (`CommandSearchEvents`); `loadMore` asks the next page with its
 * cursor. `scope` is what the screen always reads within — the failed ones, an app's prints;
 * `events` is where they are read, the stored ones unless a story hands rows in memory.
 */
export function useEventQuery(
  scope: Criteria<EventRecord> = {},
  events: Resource<EventRecord> = storedEvents,
) {
  const [status, setStatus] = useState<EventStatusFilter>("ALL");
  const [query, setQuery] = useState("");
  // The field shows each keystroke at once; the read follows at low priority.
  const searchedQuery = useDeferredValue(query);
  const [searching, setSearching] = useState(false);
  const [range, setRange] = useState<EventDateRange>("all");
  const [custom, setCustom] = useState<CriteriaGroup>(emptyCriteria);

  const criteria = useMemo(
    () =>
      merge<EventRecord>(
        merge<EventRecord>(scope, {
          ...eventCriteria({ status, query: searchedQuery, range, custom }),
        }),
        { pagination: { limit: PAGE_SIZE } },
      ),
    [scope, status, searchedQuery, range, custom],
  );
  const reading = useReading(events, criteria);

  const toggleSearch = useCallback(() => {
    setSearching((open) => !open);
  }, []);

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
      visible: reading.rows,
      count: reading.count,
      hasMore: reading.hasMore,
      isLoading: reading.status === "loading",
      loadMore: reading.more,
      reload: reading.reload,
    }),
    [status, query, searching, toggleSearch, range, custom, reading],
  );
}
