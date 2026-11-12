import type { Notice } from "@sincpro/mobile/domain/notifier";
import type { ISelectedPrinter } from "@sincpro/mobile/domain/print";
import { BluetoothPermissionDenied, PrinterNotSelected } from "@sincpro/mobile/exceptions";

/**
 * What the printer's use cases share: constants, types and pure rules. Nothing here holds a
 * dependency — what a use case does with the printer, the notifier or a repository is written
 * in the use case.
 */

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

/**
 * What the person reads when the printer needs Bluetooth and it is not granted: the printer
 * settings are where they allow it (nothing else asks for it).
 */
export const BLUETOOTH_REQUIRED: Notice = {
  name: "bluetooth.required",
  title: "Permisos de Bluetooth requeridos",
  message: "Permite Bluetooth en la configuración de la impresora",
  variant: "danger",
  actions: [PRINT_NOTICE_ACTIONS.printer],
};

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
