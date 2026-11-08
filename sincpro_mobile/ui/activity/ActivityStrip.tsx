import { Display } from "@sincpro/mobile-ui/Display";
import { useTheme } from "@sincpro/mobile-ui/theme";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function ActivityStrip({
  label,
  detail,
  tone,
  inline = false,
}: {
  label: string;
  detail?: string;
  tone: "running" | "failed";
  /** In a header action the pill stays in the row. In the app it occupies that same corner. */
  inline?: boolean;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const failed = tone === "failed";
  const color = failed ? theme.danger : theme.text.secondary;

  const line = (
    <Pressable
      accessibilityRole={detail ? "button" : undefined}
      disabled={!detail}
      onPress={() => setOpen((value) => !value)}
    >
      <View
        className="flex-row items-center gap-1.5 rounded-full bg-bg-muted px-2.5"
        style={{ minHeight: 28, maxWidth: 210 }}
      >
        <Display.Icon color={color} name={failed ? "error" : "sync"} size={14} />
        <Typography.Text
          className="flex-1"
          numberOfLines={1}
          style={{ color }}
          variant="caption"
        >
          {label}
        </Typography.Text>
      </View>
      {open && detail ? (
        <Typography.Text
          className="mt-1 max-w-[210px]"
          numberOfLines={2}
          style={{ color }}
          variant="caption"
        >
          {detail}
        </Typography.Text>
      ) : null}
    </Pressable>
  );

  if (inline) return line;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", top: insets.top + 14, right: 60, zIndex: 40 }}
    >
      {line}
    </View>
  );
}
