import { textOf } from "@sincpro/mobile/domain/events/label";
import { useCommon } from "@sincpro/mobile/entrypoints/ui/common_provider";
import { useToast } from "@sincpro/mobile-ui/Feedback";
import { useEffect, useRef } from "react";

import { useActivity } from "./useActivity";

const VARIANT = {
  success: "success",
  danger: "danger",
  info: "info",
} as const;

export function DeviceNotices() {
  const { notices } = useActivity();
  const { locale } = useCommon();
  const toast = useToast();
  const shownRef = useRef(new Set<string>());

  useEffect(() => {
    for (const notice of notices) {
      if (shownRef.current.has(notice.id)) continue;
      shownRef.current.add(notice.id);
      toast.show({
        title: textOf(notice.label, locale),
        message: textOf(notice.detail ?? notice.label, locale),
        variant: VARIANT[notice.variant ?? "info"],
      });
    }
  }, [locale, notices, toast]);

  return null;
}
