import { useCommon } from "@sincpro/mobile/entrypoints/ui/common_provider";
import { useToast } from "@sincpro/mobile-ui/Feedback";
import { useEffect, useRef } from "react";

const MAX_ERROR_LEN = 150;

/**
 * Bridges the framework's queue/cron activity state (from CommonProvider) to the
 * design-system Toast: a persistent `loading` toast while a queue/cron task runs, and a
 * `danger` toast on failure. Renders nothing — the toast UI is owned by the DS
 * `ToastProvider` (mounted in AppShell), so this must live inside it.
 */
function ProcessToast() {
  const { currentActivity, lastError, isProcessing } = useCommon();
  const toast = useToast();
  const loadingIdRef = useRef<string | null>(null);
  const shownErrorRef = useRef<string | null>(null);

  useEffect(() => {
    const showLoading = isProcessing && !lastError;
    if (showLoading) {
      const label = currentActivity?.label ?? "Sincronizando...";
      if (loadingIdRef.current) {
        toast.update(loadingIdRef.current, { message: label, variant: "loading" });
      } else {
        loadingIdRef.current = toast.loading(label);
      }
    } else if (loadingIdRef.current) {
      toast.hide(loadingIdRef.current);
      loadingIdRef.current = null;
    }
  }, [isProcessing, lastError, currentActivity, toast]);

  useEffect(() => {
    if (!lastError) {
      shownErrorRef.current = null;
      return;
    }
    const key = `${lastError.id}:${lastError.error ?? ""}`;
    if (shownErrorRef.current === key) {
      return;
    }
    shownErrorRef.current = key;

    const raw = lastError.error;
    const detail = raw
      ? raw.length > MAX_ERROR_LEN
        ? `${raw.slice(0, MAX_ERROR_LEN)}...`
        : raw
      : undefined;
    toast.danger(detail ?? lastError.label, { title: `Error: ${lastError.label}` });
  }, [lastError, toast]);

  return null;
}

export default ProcessToast;
