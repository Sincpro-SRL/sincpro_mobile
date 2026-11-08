import "@sincpro/mobile-ui/theme/globals.css";

import { useAppFonts } from "@sincpro/mobile-ui/theme/typography";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import StorybookUIRoot from "./.rnstorybook";

export default function App() {
  const fontsLoaded = useAppFonts();
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <StorybookUIRoot />
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
