import { ConfirmationProvider, OverlayHost } from "@sincpro/mobile-ui/Dialog";
import KeyboardToolbarHost from "@sincpro/mobile-ui/Form/Form.KeyboardToolbarHost";
import {
  DEFAULT_DARK_THEME,
  DEFAULT_THEME,
  setActiveTheme,
  themeToVars,
} from "@sincpro/mobile-ui/theme";
import type { Preview } from "@storybook/react-native";
import { vars } from "nativewind";
import { type ReactNode, useLayoutEffect, useState } from "react";
import { Pressable, Text, useColorScheme, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { type Edge, SafeAreaView } from "react-native-safe-area-context";

const THEMES = {
  light: DEFAULT_THEME,
  dark: DEFAULT_DARK_THEME,
} as const;
type ThemeKey = keyof typeof THEMES;
type ThemeTokens = (typeof THEMES)[ThemeKey];

function AppearanceBar({
  mode,
  onToggle,
  tokens,
}: {
  mode: ThemeKey;
  onToggle: () => void;
  tokens: ThemeTokens;
}) {
  return (
    <View
      style={{
        borderTopColor: tokens.border.default,
        borderTopWidth: 1,
        backgroundColor: tokens.bg.card,
        paddingHorizontal: 16,
        paddingVertical: 10,
      }}
    >
      <Pressable accessibilityRole="button" onPress={onToggle}>
        <Text style={{ color: tokens.text.primary, fontSize: 14 }}>
          {mode === "light" ? "Tema claro" : "Tema oscuro"}
        </Text>
      </Pressable>
    </View>
  );
}

function ThemeFrame({
  children,
  ownsScroll,
  ownsTopInset,
}: {
  children: ReactNode;
  ownsScroll: boolean;
  ownsTopInset: boolean;
}) {
  const scheme = useColorScheme();
  const [mode, setMode] = useState<ThemeKey>(scheme === "dark" ? "dark" : "light");
  const tokens = THEMES[mode];

  useLayoutEffect(() => {
    setActiveTheme(tokens);
  }, [tokens]);

  const edges: Edge[] = ownsTopInset ? ["left", "right"] : ["top", "left", "right"];

  // Theme variables on the root, the overlay host outside the scroll: sheets and dialogs
  // draw over the whole screen with the theme colors, as in the AppShell.
  return (
    <View style={[vars(themeToVars(tokens)), { flex: 1 }]}>
      <OverlayHost>
        <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: tokens.bg.page }}>
          <View style={{ flex: 1 }}>
            {ownsScroll ? (
              children
            ) : (
              <KeyboardAwareScrollView
                bottomOffset={20}
                contentContainerStyle={{ flexGrow: 1, padding: 16 }}
                keyboardShouldPersistTaps="handled"
                style={{ flex: 1, backgroundColor: tokens.bg.page }}
              >
                {children}
              </KeyboardAwareScrollView>
            )}
          </View>
          <AppearanceBar
            mode={mode}
            onToggle={() => setMode(mode === "light" ? "dark" : "light")}
            tokens={tokens}
          />
        </SafeAreaView>
      </OverlayHost>
      <KeyboardToolbarHost />
    </View>
  );
}

const preview: Preview = {
  decorators: [
    (Story, context) => (
      <ThemeFrame
        ownsScroll={context.parameters.ownsScroll === true}
        ownsTopInset={context.parameters.ownsTopInset === true}
      >
        <ConfirmationProvider>
          <Story />
        </ConfirmationProvider>
      </ThemeFrame>
    ),
  ],
  parameters: {
    noSafeArea: true,
    hideFullScreenButton: true,
  },
};

export default preview;
