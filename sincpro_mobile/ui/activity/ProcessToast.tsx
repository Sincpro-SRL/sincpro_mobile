import { textOf } from "@sincpro/mobile/domain/events/label";
import { useCommon } from "@sincpro/mobile/entrypoints/ui/common_provider";

import { ActivityStrip } from "./ActivityStrip";
import { useActivity } from "./useActivity";

const MAX_ERROR_LEN = 150;

function clip(value: string): string {
  return value.length > MAX_ERROR_LEN ? `${value.slice(0, MAX_ERROR_LEN)}...` : value;
}

function ProcessToast() {
  const { locale, debugMode } = useCommon();
  // Debug mode shows every labeled queue/cron fact. The quiet default keeps
  // only classes that opt in with `static ui = true` (print today).
  const { queue, crons, failure } = useActivity({ mode: debugMode ? "debug" : false });
  const progress = queue ?? crons[0];
  const current = failure ?? progress;
  if (!current) return null;

  const label = textOf(current.label, locale);
  if (!label) return null;
  const detail = failure?.detail != null ? clip(textOf(failure.detail, locale)) : undefined;

  return (
    <ActivityStrip
      detail={detail && detail !== label ? detail : undefined}
      label={label}
      tone={failure ? "failed" : "running"}
    />
  );
}

export default ProcessToast;
