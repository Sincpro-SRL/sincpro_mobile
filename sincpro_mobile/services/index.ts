/**
 * The core's use cases, ready to execute: importing this registers each one on
 * `commonBoundedContext` (its decorator runs when its module loads). What a module, an app and
 * a screen import — never `infrastructure/framework.ts` alone, which has none registered yet.
 * One file per use case; what several of one folder share is in its `common.ts`.
 */
export { commonBoundedContext } from "@sincpro/mobile/infrastructure/framework";
export {
  CheckBluetoothPermission,
  CommandCheckBluetoothPermission,
} from "@sincpro/mobile/services/bluetooth/check_bluetooth_permission.feature";
export {
  CommandRequestBluetoothPermission,
  RequestBluetoothPermission,
} from "@sincpro/mobile/services/bluetooth/request_bluetooth_permission.feature";
export {
  CheckConnectivity,
  CommandCheckConnectivity,
} from "@sincpro/mobile/services/connectivity/check_connectivity.feature";
export {
  CommandListTables,
  ListTables,
} from "@sincpro/mobile/services/database/list_tables.feature";
export {
  CommandReadTable,
  ReadTable,
} from "@sincpro/mobile/services/database/read_table.feature";
export {
  ActivateDomain,
  CommandActivateDomain,
} from "@sincpro/mobile/services/domains/activate_domain.feature";
export { type DomainSwitch } from "@sincpro/mobile/services/domains/common";
export {
  CommandDeactivateDomain,
  DeactivateDomain,
} from "@sincpro/mobile/services/domains/deactivate_domain.feature";
export {
  ClearEvents,
  CommandClearEvents,
} from "@sincpro/mobile/services/events/clear_events.feature";
export {
  DEFAULT_EVENT_RETENTION_DAYS,
  RECENT_EVENTS_LIMIT,
} from "@sincpro/mobile/services/events/common";
export {
  CommandDeleteEvents,
  DeleteEvents,
} from "@sincpro/mobile/services/events/delete_events.feature";
export {
  CommandListFailedEvents,
  ListFailedEvents,
} from "@sincpro/mobile/services/events/list_failed_events.feature";
export {
  CommandListRecentEvents,
  ListRecentEvents,
} from "@sincpro/mobile/services/events/list_recent_events.feature";
export {
  CommandPruneEventHistory,
  PruneEventHistory,
} from "@sincpro/mobile/services/events/prune_event_history.feature";
export {
  CommandResendEvent,
  ResendEvent,
} from "@sincpro/mobile/services/events/resend_event.feature";
export {
  CommandRetryEvents,
  RetryEvents,
} from "@sincpro/mobile/services/events/retry_events.feature";
export {
  BLUETOOTH_REQUIRED,
  PRINT_FAILURE_ACTIONS,
  PRINT_NOTICE_ACTIONS,
  type PrinterStatus,
} from "@sincpro/mobile/services/printer/common";
export {
  CommandConnectPrinter,
  ConnectPrinter,
} from "@sincpro/mobile/services/printer/connect_printer.feature";
export {
  CommandDisconnectPrinter,
  DisconnectPrinter,
} from "@sincpro/mobile/services/printer/disconnect_printer.feature";
export {
  CommandFailPagePrint,
  FailPagePrint,
} from "@sincpro/mobile/services/printer/print_jobs/fail_page_print.feature";
export {
  CommandPrintHtml,
  PrintHtml,
} from "@sincpro/mobile/services/printer/print_jobs/print_html.feature";
export {
  CommandPrintImage,
  PrintImage,
} from "@sincpro/mobile/services/printer/print_jobs/print_image.feature";
export {
  CommandPrintView,
  PrintView,
} from "@sincpro/mobile/services/printer/print_jobs/print_view.app_service";
export {
  CommandQueuePrint,
  QueuePrint,
} from "@sincpro/mobile/services/printer/print_jobs/queue_print.feature";
export {
  CommandStartPagePrint,
  StartPagePrint,
} from "@sincpro/mobile/services/printer/print_jobs/start_page_print.feature";
export {
  CommandPrintTestPage,
  PrintTestPage,
} from "@sincpro/mobile/services/printer/print_test_page.feature";
export {
  CommandPrinterStatus,
  ReadPrinterStatus,
} from "@sincpro/mobile/services/printer/read_printer_status.feature";
export {
  CommandRestorePrinterConnection,
  RestorePrinterConnection,
} from "@sincpro/mobile/services/printer/restore_printer_connection.feature";
export {
  CommandScanPrinters,
  ScanPrinters,
} from "@sincpro/mobile/services/printer/scan_printers.feature";
export {
  ApplyAppSettings,
  CommandApplyAppSettings,
  type SettingsStore,
} from "@sincpro/mobile/services/settings/apply_app_settings.feature";
export {
  CommandProcessWebViewMessage,
  ProcessWebViewMessage,
} from "@sincpro/mobile/services/webview/process_web_view_message.app_service";
