import type { StoredState } from "@sincpro/client-framework";
import type { IconName } from "@sincpro/mobile-ui/Display";

export function eventStatusIcon(state: StoredState): IconName {
  switch (state) {
    case "delivered":
      return "success";
    case "pending":
      return "time";
    case "set_aside":
      return "error";
    default:
      return "circle";
  }
}

export function eventStatusLabel(state: StoredState): string {
  switch (state) {
    case "delivered":
      return "Entregado";
    case "pending":
      return "Pendiente";
    case "set_aside":
      return "Fallido";
    default:
      return state;
  }
}

export function eventStatusBadge(
  state: StoredState,
): "danger" | "successDark" | "infoDark" | "warning" {
  switch (state) {
    case "set_aside":
      return "danger";
    case "delivered":
      return "successDark";
    case "pending":
      return "infoDark";
    default:
      return "warning";
  }
}
