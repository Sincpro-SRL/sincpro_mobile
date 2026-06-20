import { Display } from "@sincpro/mobile-ui/Display";
import { Feedback } from "@sincpro/mobile-ui/Feedback";
import { theme } from "@sincpro/mobile-ui/theme";
import { cn } from "@sincpro/mobile-ui/theme/tw";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { useEffect, useState } from "react";
import { Animated, Platform, TouchableOpacity, View } from "react-native";

import { useCommon } from "../../../entrypoints/ui/common_provider";

const Icon = Display.Icon;
const Spinner = Feedback.Spinner;
const Text = Typography.Text;

interface Props {
  position?: "top" | "bottom";
}

function ProcessToast({ position = "top" }: Props) {
  const { currentActivity, lastError, isProcessing, dismiss } = useCommon();
  const [slideAnim] = useState(new Animated.Value(-100));
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    if (lastError) setShowError(true);
  }, [lastError]);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: isProcessing ? 0 : position === "top" ? -100 : 100,
      tension: 300,
      friction: 25,
      useNativeDriver: true,
    }).start();
  }, [isProcessing, slideAnim, position]);

  function renderToast() {
    if (!isProcessing) {
      return null;
    }

    const hasError = !!lastError;
    const activity = lastError || currentActivity;
    const label = activity?.label || "Sincronizando...";

    function handleDismiss() {
      setShowError(false);
      dismiss();
    }

    return (
      <Animated.View
        className="absolute left-4 right-4 z-50 self-center"
        style={[
          position === "top"
            ? { top: Platform.OS === "ios" ? 100 : 60 }
            : { bottom: Platform.OS === "ios" ? 100 : 80 },
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        <View
          className={cn(
            "bg-white/[0.98] rounded-xl px-3.5 py-3 border-l-[3px] border-emerald-500 shadow-md",
            hasError && "bg-red-50/[0.98] border-red-500",
          )}
        >
          <View className="flex-row items-center gap-3">
            <View className="w-5 h-5 justify-center items-center">
              {hasError ? (
                <Icon color={theme.danger} name="alert-circle" size={16} />
              ) : (
                <Spinner size="small" />
              )}
            </View>

            <View className="flex-1">
              <Text
                className="text-gray-900 text-[13px] font-medium leading-4"
                variant="captionSmall"
              >
                {hasError ? `Error: ${label}` : label}
              </Text>
            </View>

            <TouchableOpacity
              accessibilityLabel={"Cerrar notificación"}
              className="w-6 h-6 justify-center items-center rounded-full bg-gray-100"
              onPress={handleDismiss}
            >
              <Icon color={theme.text.secondary} name="close" size={14} />
            </TouchableOpacity>
          </View>

          {showError && lastError?.error && (
            <View className="mt-2 pt-2 border-t border-gray-100">
              <Text
                className="text-red-500 text-[11px] leading-[15px] font-mono"
                variant="captionSmall"
              >
                {lastError.error.length > 150
                  ? `${lastError.error.substring(0, 150)}...`
                  : lastError.error}
              </Text>
            </View>
          )}
        </View>
      </Animated.View>
    );
  }

  return renderToast();
}

export default ProcessToast;
