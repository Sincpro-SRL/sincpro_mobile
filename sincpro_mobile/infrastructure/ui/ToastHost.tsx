import { useToast } from "@sincpro/mobile-ui/Feedback";
import { useEffect } from "react";

import { UI_NOTIFICATION_EVENT } from "./events";
import { UIEventBus } from "./UIEventBus";

interface UINotification {
  type?: "success" | "error" | "info";
  text1?: string;
  text2?: string;
}

const VARIANT_BY_TYPE = {
  success: "success",
  error: "danger",
  info: "info",
} as const;

/**
 * Bridges the framework's `UI_NOTIFICATION_EVENT` (emitted by services via UIEventBus)
 * to the design-system Toast. Renders nothing; the toast stack is rendered by
 * `ToastProvider` (mounted in AppShell). Must live inside `ToastProvider`.
 */
export function ToastHost() {
  const toast = useToast();

  useEffect(() => {
    const off = UIEventBus.on(UI_NOTIFICATION_EVENT, (payload) => {
      const notification = payload as UINotification;
      const variant = VARIANT_BY_TYPE[notification.type ?? "info"];
      const message = notification.text2 ?? notification.text1 ?? "";
      const title = notification.text2 ? notification.text1 : undefined;
      toast.show({ message, title, variant });
    });
    return off;
  }, [toast]);

  return null;
}
