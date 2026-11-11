import type { Notifier } from "@sincpro/mobile/domain/notifier";
import { BluetoothPermissionDenied, PrinterNotSelected } from "@sincpro/mobile/exceptions";
import { PRINT_FAILURE_ACTIONS } from "@sincpro/mobile/services/printer.service";

/** What the person reads when a print did not come out, by the failure's kind. */
export function whyNotPrinted(error: unknown, title: string): string {
  if (error instanceof PrinterNotSelected) return "Selecciona una impresora primero.";
  if (error instanceof BluetoothPermissionDenied)
    return "Habilita los permisos de Bluetooth en configuración.";
  return title
    ? `«${title}»: revisa que la impresora esté encendida y cerca.`
    : "Revisa que la impresora esté encendida y cerca.";
}

/**
 * A print the person follows in one notice (`key`):
 * 1. It turns into "Imprimiendo" while the printer connects and prints.
 * 2. Printed: it turns into "Impreso".
 * Final: not printed, it says why — with a way to the failed prints and to the printer — and
 *    the failure is thrown as it came, so the run keeps its kind.
 */
export async function printFollowed(
  notifier: Notifier,
  job: { key: string; title: string },
  print: () => Promise<void>,
): Promise<void> {
  notifier.notify({
    key: job.key,
    name: "printer.printing",
    title: "Imprimiendo",
    message: job.title || "Enviando a la impresora…",
    variant: "loading",
  });
  try {
    await print();
  } catch (error) {
    notifier.notify({
      key: job.key,
      name: "printer.print_failed",
      title: "No se imprimió",
      message: whyNotPrinted(error, job.title),
      variant: "danger",
      actions: PRINT_FAILURE_ACTIONS,
    });
    throw error;
  }
  notifier.notify({
    key: job.key,
    name: "printer.printed",
    title: "Impreso",
    message: job.title || "La impresión salió",
    variant: "success",
  });
}
