export { EBuiltinCron } from "@sincpro/mobile/entrypoints/cron/EBuiltinCron";
export type {
  AppShellConfig,
  AppShellDefinition,
} from "@sincpro/mobile/entrypoints/ui/AppShell";
export { AppShell, defineAppShell } from "@sincpro/mobile/entrypoints/ui/AppShell";
export type { TimezoneLocale } from "@sincpro/mobile/entrypoints/ui/common_provider";
export { CommonProvider, useCommon } from "@sincpro/mobile/entrypoints/ui/common_provider";
export type {
  DomainEntry,
  DomainSwitcherValue,
} from "@sincpro/mobile/entrypoints/ui/domain_switcher";
export {
  DomainSwitcherProvider,
  useDomainSwitcher,
} from "@sincpro/mobile/entrypoints/ui/domain_switcher";
export type { DeepPartial, ThemeTokens } from "@sincpro/mobile/entrypoints/ui/theme";
export { createTheme } from "@sincpro/mobile/entrypoints/ui/theme";
export { defineBackgroundCrons } from "@sincpro/mobile/framework/background";
export { BaseModule, baseModule } from "@sincpro/mobile/framework/base_module";
export type { AppConfig } from "@sincpro/mobile/framework/createApp";
export { createApp, createKernel, startApp } from "@sincpro/mobile/framework/createApp";
export { DomainModule } from "@sincpro/mobile/framework/domain_module";
export { Kernel } from "@sincpro/mobile/framework/kernel";
export { orchestrator } from "@sincpro/mobile/framework/orchestrator";
export { eventDelivery } from "@sincpro/mobile/infrastructure/events/delivery";
export { eventOutbox } from "@sincpro/mobile/infrastructure/events/outbox";
export { deviceNotifier } from "@sincpro/mobile/infrastructure/ui/activity";
export { installGlobalErrorHandler } from "@sincpro/mobile/infrastructure/ui/errorHandler";
export * from "@sincpro/mobile/services";

// Observability — opt-in, tree-shakeable
export { Debug } from "@sincpro/mobile/infrastructure/debug";
export type {
  InterceptorHooks,
  MethodCall,
} from "@sincpro/mobile/infrastructure/interceptor/intercept";
export {
  interceptClass,
  interceptFunction,
  interceptInstance,
} from "@sincpro/mobile/infrastructure/interceptor/intercept";
export { loggingHooks } from "@sincpro/mobile/infrastructure/interceptor/logging_hooks";
export type { LoggerPolicy } from "@sincpro/mobile/infrastructure/logger";
export {
  configureLogger,
  DEFAULT_DEBUG_LOGS,
  DEFAULT_PRODUCTION_LOGS,
  defaultEnabledLayers,
  errorAttributes,
  getEnabledLayers,
  isDebugLogging,
  isLayerEnabled,
  LOG_LAYERS,
  mobileLogger,
  productionLogs,
  resetEnabledLayers,
  setDebugLogging,
  setEnabledLayers,
  setLayerEnabled,
  subscribeLoggerConfig,
} from "@sincpro/mobile/infrastructure/logger";
export {
  type AppIdentity,
  appIdentity,
  instrumentObservability,
  type Observability,
  type ObservabilityConfig,
  processObservability,
} from "@sincpro/mobile/infrastructure/observability";
export type {
  LokiAuth,
  LokiConfig,
  TelemetryConfig,
} from "@sincpro/mobile/infrastructure/telemetry";
export { initTelemetry } from "@sincpro/mobile/infrastructure/telemetry";
export type { ActivityVisibility } from "@sincpro/mobile/infrastructure/ui/activity";
