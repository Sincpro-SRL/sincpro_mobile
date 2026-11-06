import { textOf } from "@sincpro/mobile/domain/events/label";
import { useCommon } from "@sincpro/mobile/entrypoints/ui/common_provider";
import { useToast } from "@sincpro/mobile-ui/Feedback";
import { useEffect, useRef } from "react";

import { useActivity } from "./useActivity";

const MAX_ERROR_LEN = 150;
const MIN_VISIBLE_MS = 1200;

function ProcessToast() {
  const { queue, crons, failure } = useActivity();
  const { locale } = useCommon();
  const toast = useToast();
  const loadingIdRef = useRef<string | null>(null);
  const shownErrorRef = useRef<string | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const progress = queue ?? crons[0];
  const progressLabel = textOf(progress?.label, locale);

  useEffect(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    const hideLoading = () => {
      if (!loadingIdRef.current) return;
      toast.hide(loadingIdRef.current);
      loadingIdRef.current = null;
      startedAtRef.current = null;
    };

    if (progress && !failure) {
      if (startedAtRef.current == null) startedAtRef.current = Date.now();
      if (loadingIdRef.current) {
        toast.update(loadingIdRef.current, { message: progressLabel, variant: "loading" });
      } else {
        loadingIdRef.current = toast.loading(progressLabel);
      }
    } else if (loadingIdRef.current) {
      const elapsed = startedAtRef.current
        ? Date.now() - startedAtRef.current
        : MIN_VISIBLE_MS;
      const wait = failure ? 0 : Math.max(0, MIN_VISIBLE_MS - elapsed);
      hideTimerRef.current = setTimeout(hideLoading, wait);
    }

    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [failure, progress, progressLabel, toast]);

  useEffect(() => {
    if (!failure) {
      shownErrorRef.current = null;
      return;
    }
    if (shownErrorRef.current === failure.id) return;
    shownErrorRef.current = failure.id;

    const raw = failure.detail != null ? textOf(failure.detail, locale) : undefined;
    const detail = raw
      ? raw.length > MAX_ERROR_LEN
        ? `${raw.slice(0, MAX_ERROR_LEN)}...`
        : raw
      : undefined;
    const title = textOf(failure.label, locale);
    toast.danger(detail ?? title, { title: `Error: ${title}` });
  }, [failure, locale, toast]);

  return null;
}

export default ProcessToast;
