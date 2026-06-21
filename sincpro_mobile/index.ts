export type { AppShellConfig } from "@sincpro/mobile/entrypoints/ui/AppShell";
export { createAppShell } from "@sincpro/mobile/entrypoints/ui/AppShell";
export type { TimezoneLocale } from "@sincpro/mobile/entrypoints/ui/common_provider";
export { CommonProvider, useCommon } from "@sincpro/mobile/entrypoints/ui/common_provider";
export type { DomainApp } from "@sincpro/mobile/entrypoints/ui/domain_switcher";
export {
  ActiveDomainApp,
  DomainSwitcherProvider,
  useDomainSwitcher,
} from "@sincpro/mobile/entrypoints/ui/domain_switcher";
export type { DeepPartial, ThemeTokens } from "@sincpro/mobile/entrypoints/ui/theme";
export { createTheme } from "@sincpro/mobile/entrypoints/ui/theme";
export { BaseModule, baseModule } from "@sincpro/mobile/framework/base_module";
export type { AppConfig } from "@sincpro/mobile/framework/createApp";
export { createApp } from "@sincpro/mobile/framework/createApp";
export { DomainModule } from "@sincpro/mobile/framework/domain_module";
export { Kernel } from "@sincpro/mobile/framework/kernel";
export { orchestrator } from "@sincpro/mobile/framework/orchestrator";
export { installGlobalErrorHandler } from "@sincpro/mobile/infrastructure/ui/errorHandler";
export { PlainLayout, TabNavigatorLayout } from "@sincpro/mobile/ui/layouts/router_layouts";
