export { BaseModule, baseModule } from "./entrypoints/app/base_module";
export type { AppConfig } from "./entrypoints/app/createApp";
export { createApp } from "./entrypoints/app/createApp";
export { DomainModule } from "./entrypoints/app/domain_module";
export { Kernel } from "./entrypoints/app/kernel";
export { orchestrator } from "./entrypoints/app/orchestrator";
export type { AppShellConfig } from "./entrypoints/ui/AppShell";
export { createAppShell } from "./entrypoints/ui/AppShell";
export type { TimezoneLocale } from "./entrypoints/ui/common_provider";
export { CommonProvider, useCommon } from "./entrypoints/ui/common_provider";
export type { DomainApp } from "./entrypoints/ui/domain_switcher";
export {
  ActiveDomainApp,
  DomainSwitcherProvider,
  useDomainSwitcher,
} from "./entrypoints/ui/domain_switcher";
export { installGlobalErrorHandler } from "./infrastructure/ui/errorHandler";
