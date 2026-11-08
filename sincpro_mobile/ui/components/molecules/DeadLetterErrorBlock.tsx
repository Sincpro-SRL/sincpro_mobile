import { Display } from "@sincpro/mobile-ui/Display";
import { Pressable } from "@sincpro/mobile-ui/primitives/Pressable";
import { useTheme } from "@sincpro/mobile-ui/theme";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { View } from "react-native";

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
  const theme = useTheme();
  if (!errorMessage) return null;
  const truncated = errorMessage.length > previewChars;
  const preview = truncated ? `${errorMessage.slice(0, previewChars)}…` : errorMessage;

  return (
    <Pressable accessibilityRole="button" className="mt-3" onPress={onToggle}>
      <View className="flex-row items-center gap-1.5">
        <Display.Icon color={theme.danger} name="error" size={16} />
        <Typography.Text className="text-danger" semibold variant="bodySmall">
          {expanded ? "Ocultar error" : "Ver error"}
        </Typography.Text>
      </View>
      <Typography.Text
        className="mt-1 text-danger"
        numberOfLines={expanded ? undefined : 3}
        variant="bodySmall"
      >
        {expanded ? errorMessage : preview}
      </Typography.Text>
    </Pressable>
  );
}

export default DeadLetterErrorBlock;
