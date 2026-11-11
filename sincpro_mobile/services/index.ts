/**
 * The core's use cases, ready to execute: importing this registers each one on
 * `commonBoundedContext` (its decorator runs when its module loads). What a module, an app and
 * a screen import — never `infrastructure/framework.ts` alone, which has none registered yet.
 */
export { commonBoundedContext } from "@sincpro/mobile/infrastructure/framework";
export {
  CheckBluetoothPermission,
  CommandCheckBluetoothPermission,
  CommandRequestBluetoothPermission,
  RequestBluetoothPermission,
} from "@sincpro/mobile/services/bluetooth/permission.feature";
export {
  CheckConnectivity,
  CommandCheckConnectivity,
} from "@sincpro/mobile/services/connectivity/check_connectivity.feature";
export {
  CommandListTables,
  CommandReadTable,
  ListTables,
  ReadTable,
} from "@sincpro/mobile/services/database/tables.feature";
export {
  ActivateDomain,
  CommandActivateDomain,
  CommandDeactivateDomain,
  DeactivateDomain,
  type DomainSwitch,
} from "@sincpro/mobile/services/domains/activate_domain.feature";
export {
  CommandDeleteEvents,
  CommandListFailedEvents,
  CommandListRecentEvents,
  CommandPruneEventHistory,
  CommandResendEvent,
  CommandRetryEvents,
  DeleteEvents,
  ListFailedEvents,
  ListRecentEvents,
  PruneEventHistory,
  ResendEvent,
  RetryEvents,
} from "@sincpro/mobile/services/events/stored_events.feature";
export {
  CommandFailPagePrint,
  CommandQueuePrint,
  CommandStartPagePrint,
  FailPagePrint,
  QueuePrint,
  StartPagePrint,
} from "@sincpro/mobile/services/print/page_print.feature";
export {
  CommandPrintHtml,
  CommandPrintView,
  PrintHtml,
  PrintView,
} from "@sincpro/mobile/services/print/print_document.feature";
export {
  CommandPrintImage,
  PrintImage,
} from "@sincpro/mobile/services/print/print_image.feature";
export {
  CommandConnectPrinter,
  CommandDisconnectPrinter,
  CommandPrinterStatus,
  CommandRestorePrinterConnection,
  CommandScanPrinters,
  ConnectPrinter,
  DisconnectPrinter,
  type PrinterStatus,
  ReadPrinterStatus,
  RestorePrinterConnection,
  ScanPrinters,
} from "@sincpro/mobile/services/printer/connection.feature";
export {
  CommandPrintTestPage,
  PrintTestPage,
} from "@sincpro/mobile/services/printer/test_page.feature";
export {
  ApplyAppSettings,
  CommandApplyAppSettings,
  type SettingsStore,
} from "@sincpro/mobile/services/settings/apply_app_settings.feature";
export {
  CommandProcessWebViewMessage,
  ProcessWebViewMessage,
} from "@sincpro/mobile/services/webview/process_web_view_message.feature";
