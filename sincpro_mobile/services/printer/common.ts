import type { Notifier } from "@sincpro/mobile/domain/notifier";
import type { ISelectedPrinter } from "@sincpro/mobile/domain/print";
import { BluetoothPermissionDenied, PrinterNotSelected } from "@sincpro/mobile/exceptions";

/**
 * Where a printer's notice sends the person. The host maps each intent to a screen
 * (`AppShellConfig.onNoticeAction`): `failed-prints` to the prints that did not come out,
 * `printer` to its settings.
 */
export const PRINT_NOTICE_ACTIONS = {
  failed: { label: "Ver fallidas", intent: "failed-prints" },
  printer: { label: "Impresora", intent: "printer" },
} as const;

/** What a print that did not come out offers: the failed list and the printer settings. */
export const PRINT_FAILURE_ACTIONS = [
  PRINT_NOTICE_ACTIONS.failed,
  PRINT_NOTICE_ACTIONS.printer,
];

/** What the printer settings show: Bluetooth granted, the printer chosen, and its link. */
export type PrinterStatus = {
  readonly bluetoothGranted: boolean;
  readonly selected: ISelectedPrinter | null;
  readonly connected: boolean;
};

/** What the person reads when a print did not come out, by the failure's kind. */
export function whyNotPrinted(error: unknown, title: string): string {
  if (error instanceof PrinterNotSelected) return "Selecciona una impresora primero.";
  if (error instanceof BluetoothPermissionDenied)
    return "Habilita los permisos de Bluetooth en configuración.";
  return title
    ? `«${title}»: revisa que la impresora esté encendida y cerca.`
    : "Revisa que la impresora esté encendida y cerca.";
}

/** Tells the person Bluetooth is not granted; answers whether that was the failure. */
export function toldBluetoothDenied(error: unknown, notifier: Notifier): boolean {
  if (!(error instanceof BluetoothPermissionDenied)) return false;
  notifier.notify({
    name: "bluetooth.required",
    title: "Permisos de Bluetooth requeridos",
    message: "Habilita los permisos de Bluetooth en configuración",
    variant: "danger",
  });
  return true;
}
