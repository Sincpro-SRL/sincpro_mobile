import { useCommon } from "@sincpro/mobile/entrypoints/ui/common_provider";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { View } from "react-native";

function DebugBanner() {
  const { debugMode } = useCommon();

  function renderBanner() {
    if (!debugMode) {
      return null;
    }

    return (
      <View className="bg-accent py-2 px-4">
        <Typography.Text className="text-white font-bold text-center" semibold>
          {"⚠️ Estás en modo Debug"}
        </Typography.Text>
      </View>
    );
  }

  return renderBanner();
}

export { DebugBanner };
