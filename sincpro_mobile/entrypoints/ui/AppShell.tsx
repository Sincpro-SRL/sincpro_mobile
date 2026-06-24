import {
  DefaultTheme as NavDefaultTheme,
  NavigationContainer,
} from "@react-navigation/native";
import { createApp } from "@sincpro/mobile/framework/createApp";
import type { DomainModule } from "@sincpro/mobile/framework/domain_module";
import { ToastHost } from "@sincpro/mobile/infrastructure/ui/ToastHost";
import { type BrandingConfig, setBranding } from "@sincpro/mobile-ui";
import { ToastProvider } from "@sincpro/mobile-ui/Feedback";
import {
  setActiveTheme,
  type ThemeTokens,
  themeToVars,
  useTheme,
} from "@sincpro/mobile-ui/theme";
import { useAppFonts } from "@sincpro/mobile-ui/theme/typography";
import * as SplashScreen from "expo-splash-screen";
import { vars } from "nativewind";
import { type ComponentType, type ReactNode, useEffect, useState } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import {
  initialWindowMetrics,
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";

import { CommonProvider } from "./common_provider";
import { ActiveDomainApp, type DomainApp, DomainSwitcherProvider } from "./domain_switcher";

type ProviderComponent = ComponentType<{ children: ReactNode }>;

export interface AppShellConfig {
  domains: DomainModule[];
  ui: Record<string, ComponentType>;
  activeDomain: string;
  providers?: ProviderComponent[];
  theme?: ThemeTokens;
  darkTheme?: ThemeTokens;
  branding?: BrandingConfig;
  /** Component rendered while fonts + domain init complete. Use `AppSplashView` from the DS or roll your own. */
  splashComponent?: ComponentType;
  /** Minimum time (ms) the splash stays visible. Default 2000. */
  splashDuration?: number;
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
  if (config.branding) {
    setBranding(config.branding);
  }
  return function AppShell() {
    const [isReady, setIsReady] = useState(false);
    const [minDurationMet, setMinDurationMet] = useState(false);
    const fontsLoaded = useAppFonts();
    const activeTheme = useTheme();
    const themeStyle = vars(themeToVars(activeTheme));
    const navTheme = {
      ...NavDefaultTheme,
      colors: { ...NavDefaultTheme.colors, background: activeTheme.bg.page },
    };

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
      const t = setTimeout(() => setMinDurationMet(true), config.splashDuration ?? 2000);
      return () => clearTimeout(t);
    }, []);

    useEffect(() => {
      if (fontsLoaded && isReady && minDurationMet) {
        SplashScreen.hideAsync().catch(() => {});
      }
    }, [fontsLoaded, isReady, minDurationMet]);

    if (!isReady || !fontsLoaded || !minDurationMet) {
      const Splash = config.splashComponent;
      return Splash ? (
        <Splash />
      ) : (
        <View style={{ flex: 1, backgroundColor: activeTheme.bg.page }} />
      );
    }

    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1" style={themeStyle}>
          <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
              <KeyboardProvider>
                <CommonProvider darkTheme={config.darkTheme} lightTheme={config.theme}>
                  <ToastProvider position="top">
                    {withProviders(
                      providers,
                      <DomainSwitcherProvider apps={apps} initialDomain={config.activeDomain}>
                        <NavigationContainer theme={navTheme}>
                          <ActiveDomainApp />
                        </NavigationContainer>
                      </DomainSwitcherProvider>,
                    )}
                    <ToastHost />
                  </ToastProvider>
                </CommonProvider>
              </KeyboardProvider>
            </SafeAreaView>
          </SafeAreaProvider>
        </View>
      </GestureHandlerRootView>
    );
  };
}
