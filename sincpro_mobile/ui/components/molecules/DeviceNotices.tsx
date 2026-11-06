import { useActivity } from "@sincpro/mobile/ui/activity/useActivity";
import { useToast } from "@sincpro/mobile-ui/Feedback";
import { useEffect, useRef } from "react";

const VARIANT = {
  success: "success",
  danger: "danger",
  info: "info",
} as const;

export function DeviceNotices() {
  const { notices } = useActivity();
  const toast = useToast();
  const shownRef = useRef(new Set<string>());

  useEffect(() => {
    for (const notice of notices) {
      if (shownRef.current.has(notice.id)) continue;
      shownRef.current.add(notice.id);
      const variant = VARIANT[notice.variant ?? "info"];
      toast.show({
        title: notice.label,
        message: notice.detail ?? notice.label,
        variant,
      });
    }
  }, [notices, toast]);

  return null;
}
