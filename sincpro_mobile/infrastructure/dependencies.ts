import type { BoundedContext } from "@sincpro/client-framework";
import { SettingsRepository } from "@sincpro/mobile/adapters/repositories/setting.repository";
import type { Notifier } from "@sincpro/mobile/domain/notifier";
import { orchestrator } from "@sincpro/mobile/framework/orchestrator";
import { deviceNotifier } from "@sincpro/mobile/infrastructure/ui/activity";
import type { DomainSwitch } from "@sincpro/mobile/services/domains/activate_domain.feature";
import {
  type NetworkUseCases,
  networkUseCases,
} from "@sincpro/mobile/services/network.service";
import {
  type PrinterService,
  printerService,
} from "@sincpro/mobile/services/printer.service";
import type { SettingsStore } from "@sincpro/mobile/services/settings/apply_app_settings.feature";
import {
  type WebViewService,
  webViewService,
} from "@sincpro/mobile/services/webview.service";

/**
 * What every use case of the core's bounded context finds on `this` — the backend's
 * `dependencies.py`: declared once here, never in a Feature.
 */
export interface CommonDependencies {
  domains: DomainSwitch;
  settingsStore: SettingsStore;
  printer: PrinterService;
  webView: WebViewService;
  notifier: Notifier;
  connectivity: NetworkUseCases;
}

/** Supplies each dependency at runtime; an app replaces one with `addDependency(…, { replaces })`. */
export function registerDependencies(
  boundedContext: BoundedContext<CommonDependencies>,
): BoundedContext<CommonDependencies> {
  boundedContext.addDependency("domains", orchestrator);
  boundedContext.addDependency("settingsStore", SettingsRepository);
  boundedContext.addDependency("printer", printerService);
  boundedContext.addDependency("webView", webViewService);
  boundedContext.addDependency("notifier", deviceNotifier);
  boundedContext.addDependency("connectivity", networkUseCases);
  return boundedContext;
}
