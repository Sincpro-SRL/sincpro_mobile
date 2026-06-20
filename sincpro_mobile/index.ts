export { BaseModule, baseModule } from "@sincpro/mobile/entrypoints/app/base_module";
export type { AppConfig } from "@sincpro/mobile/entrypoints/app/createApp";
export { createApp } from "@sincpro/mobile/entrypoints/app/createApp";
export { DomainModule } from "@sincpro/mobile/entrypoints/app/domain_module";
export { Kernel } from "@sincpro/mobile/entrypoints/app/kernel";
export { orchestrator } from "@sincpro/mobile/entrypoints/app/orchestrator";
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
export { installGlobalErrorHandler } from "@sincpro/mobile/infrastructure/ui/errorHandler";
