/**
 * The core's use cases, ready to execute: importing this registers each one on
 * `commonBoundedContext` (its decorator runs when its module loads). What a module and an app
 * import — never `infrastructure/framework.ts` alone, which has none registered yet.
 */
export { commonBoundedContext } from "@sincpro/mobile/infrastructure/framework";
export {
  ActivateDomain,
  CommandActivateDomain,
  CommandDeactivateDomain,
  DeactivateDomain,
  type DomainSwitch,
} from "@sincpro/mobile/services/domains/activate_domain.feature";
export {
  CommandPrintImage,
  PrintImage,
} from "@sincpro/mobile/services/print/print_image.feature";
export {
  ApplyAppSettings,
  CommandApplyAppSettings,
  type SettingsStore,
} from "@sincpro/mobile/services/settings/apply_app_settings.feature";
export {
  CommandProcessWebViewMessage,
  ProcessWebViewMessage,
} from "@sincpro/mobile/services/webview/process_web_view_message.feature";
