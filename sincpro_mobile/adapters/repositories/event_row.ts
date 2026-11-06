import { EEventStatus } from "@sincpro/mobile/domain/event_sourcing/domain_event";
import { IntegrationEvent } from "@sincpro/mobile/domain/event_sourcing/integration_event";

export type EventRow = {
  data: string;
  status?: string | null;
  attempts?: number | null;
  error_message?: string | null;
  acknowledged_at?: string | null;
  failed_at?: string | null;
  source_id?: string | null;
  sequence?: number | null;
  requires_network?: number | null;
};

export function readEvent(row: EventRow): IntegrationEvent {
  const event = IntegrationEvent.fromJSON<IntegrationEvent>(row.data);
  if (row.status) event.status = row.status as EEventStatus;
  if (row.attempts != null) event.attempts = row.attempts;
  if (row.error_message !== undefined) event.errorMessage = row.error_message;
  if (row.acknowledged_at !== undefined) event.acknowledgedAt = row.acknowledged_at;
  if (row.failed_at !== undefined) event.failedAt = row.failed_at;
  if (row.source_id) event.sourceId = row.source_id;
  if (row.sequence != null) event.sequence = row.sequence;
  if (row.requires_network != null) {
    Object.assign(event, { requiresNetwork: row.requires_network === 1 });
  }
  return event;
}
