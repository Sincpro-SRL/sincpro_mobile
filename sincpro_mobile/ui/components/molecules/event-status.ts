import { EEventStatus } from "@sincpro/mobile/domain/events";
import type { IconName } from "@sincpro/mobile-ui/Display";

export function eventStatusIcon(status: string): IconName {
  switch (status) {
    case EEventStatus.ACKNOWLEDGED:
      return "success";
    case EEventStatus.PENDING:
      return "time";
    case EEventStatus.PROCESSING:
      return "sync";
    case EEventStatus.FAILED:
      return "error";
    case EEventStatus.CANCELLED:
      return "dismiss";
    default:
      return "circle";
  }
}

export function eventStatusLabel(status: string): string {
  switch (status) {
    case EEventStatus.ACKNOWLEDGED:
      return "Reconocido";
    case EEventStatus.PENDING:
      return "Pendiente";
    case EEventStatus.PROCESSING:
      return "Procesando";
    case EEventStatus.FAILED:
      return "Fallido";
    case EEventStatus.CANCELLED:
      return "Cancelado";
    default:
      return status;
  }
}

export function eventStatusBadge(
  status: string,
): "danger" | "successDark" | "infoDark" | "warning" {
  switch (status) {
    case EEventStatus.FAILED:
      return "danger";
    case EEventStatus.ACKNOWLEDGED:
      return "successDark";
    case EEventStatus.PENDING:
    case EEventStatus.PROCESSING:
      return "infoDark";
    default:
      return "warning";
  }
}
