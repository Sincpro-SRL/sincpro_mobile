import { useActivity } from "@sincpro/mobile/ui/activity/useActivity";
import { useToast } from "@sincpro/mobile-ui/Feedback";
import { useEffect, useRef } from "react";

const MAX_ERROR_LEN = 150;
const QUEUE_MIN_VISIBLE_MS = 1200;

function ProcessToast() {
  const { queue, crons, failure } = useActivity();
  const toast = useToast();
  const loadingIdRef = useRef<string | null>(null);
  const shownErrorRef = useRef<string | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const progress = queue ?? crons[0];

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
        toast.update(loadingIdRef.current, { message: progress.label, variant: "loading" });
      } else {
        loadingIdRef.current = toast.loading(progress.label);
      }
      return;
    }

    if (!loadingIdRef.current) return;

    const elapsed = startedAtRef.current
      ? Date.now() - startedAtRef.current
      : QUEUE_MIN_VISIBLE_MS;
    const wait = failure ? 0 : Math.max(0, QUEUE_MIN_VISIBLE_MS - elapsed);
    hideTimerRef.current = setTimeout(hideLoading, wait);

    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [progress, failure, toast]);

  useEffect(() => {
    if (!failure || failure.channel === "device") {
      shownErrorRef.current = null;
      return;
    }
    const key = failure.id;
    if (shownErrorRef.current === key) return;
    shownErrorRef.current = key;

    const raw = failure.detail;
    const detail = raw
      ? raw.length > MAX_ERROR_LEN
        ? `${raw.slice(0, MAX_ERROR_LEN)}...`
        : raw
      : undefined;
    toast.danger(detail ?? failure.label, { title: `Error: ${failure.label}` });
  }, [failure, toast]);

  return null;
}

export default ProcessToast;
