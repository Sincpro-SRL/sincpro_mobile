import { useEffect } from "react";
import Toast from "react-native-toast-message";

import { UI_NOTIFICATION_EVENT } from "./events";
import { UIEventBus } from "./UIEventBus";

interface UINotification {
  type?: "success" | "error" | "info";
  text1?: string;
  text2?: string;
}

export function ToastHost() {
  useEffect(() => {
    const off = UIEventBus.on(UI_NOTIFICATION_EVENT, (payload) => {
      const notification = payload as UINotification;
      Toast.show({
        type: notification.type ?? "info",
        text1: notification.text1,
        text2: notification.text2,
      });
    });
    return off;
  }, []);

  return <Toast />;
}
