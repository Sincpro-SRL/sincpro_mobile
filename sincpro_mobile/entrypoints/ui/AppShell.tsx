import { createApp } from "@sincpro/mobile/framework/createApp";
import type { DomainModule } from "@sincpro/mobile/framework/domain_module";
import { ToastHost } from "@sincpro/mobile/infrastructure/ui/ToastHost";
import { setActiveTheme, type ThemeTokens, themeToVars } from "@sincpro/mobile-ui/theme";
import { useAppFonts } from "@sincpro/mobile-ui/theme/typography";
import * as SplashScreen from "expo-splash-screen";
import { vars } from "nativewind";
import { type ComponentType, type ReactNode, useEffect, useState } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";
import { NativeRouter } from "react-router-native";

import { CommonProvider } from "./common_provider";
import { ActiveDomainApp, type DomainApp, DomainSwitcherProvider } from "./domain_switcher";

type ProviderComponent = ComponentType<{ children: ReactNode }>;

export interface AppShellConfig {
  domains: DomainModule[];
  ui: Record<string, ComponentType>;
  activeDomain: string;
  providers?: ProviderComponent[];
  theme?: ThemeTokens;
}

function withProviders(providers: ProviderComponent[], children: ReactNode): ReactNode {
  return providers.reduceRight<ReactNode>(
    (acc, Provider) => <Provider>{acc}</Provider>,
    children,
  );
}

export function createAppShell(config: AppShellConfig): ComponentType {
  const apps: DomainApp[] = config.domains
    .filter((module) => Boolean(config.ui[module.key]))
    .map((module) => ({
      key: module.key,
      name: module.name,
      component: config.ui[module.key],
    }));
  const providers = config.providers ?? [];

  if (config.theme) {
    setActiveTheme(config.theme);
  }
  const themeStyle = config.theme ? vars(themeToVars(config.theme)) : undefined;

  return function AppShell() {
    const [isReady, setIsReady] = useState(false);
    const fontsLoaded = useAppFonts();

    useEffect(() => {
      let active = true;
      createApp({ domains: config.domains }).then(() => {
        if (active) setIsReady(true);
      });
      return () => {
        active = false;
      };
    }, []);

    useEffect(() => {
      SplashScreen.preventAutoHideAsync().catch(() => {});
    }, []);

    useEffect(() => {
      if (fontsLoaded && isReady) {
        SplashScreen.hideAsync().catch(() => {});
      }
    }, [fontsLoaded, isReady]);

    if (!isReady || !fontsLoaded) {
      return null;
    }

    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1" style={themeStyle}>
          <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <KeyboardProvider>
              <CommonProvider>
                {withProviders(
                  providers,
                  <DomainSwitcherProvider apps={apps} initialDomain={config.activeDomain}>
                    <NativeRouter>
                      <ActiveDomainApp />
                    </NativeRouter>
                  </DomainSwitcherProvider>,
                )}
                <ToastHost />
              </CommonProvider>
            </KeyboardProvider>
          </SafeAreaProvider>
        </View>
      </GestureHandlerRootView>
    );
  };
}
