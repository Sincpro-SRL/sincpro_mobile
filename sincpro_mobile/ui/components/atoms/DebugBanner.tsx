import { useCommon } from "@sincpro/mobile/entrypoints/ui/common_provider";
import { Feedback } from "@sincpro/mobile-ui/Feedback";

function DebugBanner() {
  const { debugMode } = useCommon();

  if (!debugMode) {
    return null;
  }

  return <Feedback.Banner message="Estás en modo Debug" tone="warning" />;
}

export { DebugBanner };
