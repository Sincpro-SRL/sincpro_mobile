import { eventStore } from "@sincpro/mobile/adapters/repositories/sqlite_event_store";
import type { Outbox } from "@sincpro/mobile/domain/repositories/document_store";

import { eventDelivery } from "./delivery";

/** A repository's outbox on a phone: the event store, then the delivery after the commit. */
export function eventOutbox(): Outbox {
  return {
    save: (stored) => eventStore.add(stored),
    schedule: () => {
      void eventDelivery.drain();
    },
  };
}
