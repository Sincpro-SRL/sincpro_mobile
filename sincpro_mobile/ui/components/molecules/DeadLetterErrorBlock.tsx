import { Display } from "@sincpro/mobile-ui/Display";
import { theme } from "@sincpro/mobile-ui/theme";
import { cn } from "@sincpro/mobile-ui/theme/tw";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { TouchableOpacity, View } from "react-native";

interface DeadLetterErrorBlockProps {
  errorMessage?: string | null;
  expanded: boolean;
  onToggle: () => void;
  previewChars?: number;
}

function DeadLetterErrorBlock({
  errorMessage,
  expanded,
  onToggle,
  previewChars = 140,
}: DeadLetterErrorBlockProps) {
  if (!errorMessage) return null;
  const preview = errorMessage.substring(0, previewChars);
  const truncated = errorMessage.length > previewChars;

  return (
    <View
      className={cn(
        "border-l-[3px] border-red-500 bg-red-50 p-2.5 rounded-xl mb-3",
        expanded && "bg-red-100",
      )}
    >
      <TouchableOpacity
        accessibilityRole="button"
        activeOpacity={0.75}
        className="flex-row items-center mb-1"
        onPress={onToggle}
      >
        <Display.Icon color={theme.danger} name="alert-circle" size={16} type="feather" />
        <Typography.Text className="text-red-600 ml-1.5" semibold variant="bodySmall">
          {"Error"}
        </Typography.Text>
      </TouchableOpacity>
      {!expanded && (
        <Typography.Text className="text-red-600" numberOfLines={3} variant="bodySmall">
          {preview}
          {truncated ? "…" : ""}
        </Typography.Text>
      )}
      {expanded && (
        <View className="bg-white rounded-lg p-2.5 border border-red-100">
          <Typography.Text className="text-red-600 text-xs leading-4" variant="bodySmall">
            {errorMessage}
          </Typography.Text>
        </View>
      )}
      {truncated && !expanded && (
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.7}
          className="mt-1.5"
          onPress={onToggle}
        >
          <Typography.Text className="text-red-600 underline" semibold variant="bodySmall">
            {"Ver error completo"}
          </Typography.Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default DeadLetterErrorBlock;
