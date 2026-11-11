import { BoundedContext } from "@sincpro/client-framework";
import { SettingsRepository } from "@sincpro/mobile/adapters/repositories/setting.repository";
import { orchestrator } from "@sincpro/mobile/framework/orchestrator";
import {
  ActivateDomain,
  CommandActivateDomain,
  CommandDeactivateDomain,
  DeactivateDomain,
  type DomainSwitch,
} from "@sincpro/mobile/services/domains/activate_domain.feature";
import {
  CommandPrintImage,
  PrintImage,
} from "@sincpro/mobile/services/print/print_image.feature";
import {
  type PrinterService,
  printerService,
} from "@sincpro/mobile/services/printer.service";
import {
  ApplyAppSettings,
  CommandApplyAppSettings,
  type SettingsStore,
} from "@sincpro/mobile/services/settings/apply_app_settings.feature";
import {
  type WebViewService,
  webViewService,
} from "@sincpro/mobile/services/webview.service";
import {
  CommandProcessWebViewMessage,
  ProcessWebViewMessage,
} from "@sincpro/mobile/services/webview/process_web_view_message.feature";

export type CommonDependencies = {
  domains: DomainSwitch;
  settingsStore: SettingsStore;
  printer: PrinterService;
  webView: WebViewService;
};

/**
 * The core's bounded context: the use cases every app has — turning a domain on or off, keeping
 * settings it received, printing an image, reading what a page posted. Its subscriptions
 * (`commonSubscriptions`) execute them when their events arrive; an app executes them too.
 */
export const commonBoundedContext = new BoundedContext<CommonDependencies>("common");
commonBoundedContext.addDependency("domains", orchestrator);
commonBoundedContext.addDependency("settingsStore", SettingsRepository);
commonBoundedContext.addDependency("printer", printerService);
commonBoundedContext.addDependency("webView", webViewService);
commonBoundedContext.feature(CommandActivateDomain)(ActivateDomain);
commonBoundedContext.feature(CommandDeactivateDomain)(DeactivateDomain);
commonBoundedContext.feature(CommandApplyAppSettings)(ApplyAppSettings);
commonBoundedContext.feature(CommandPrintImage)(PrintImage);
commonBoundedContext.feature(CommandProcessWebViewMessage)(ProcessWebViewMessage);
