import { Command } from "@sincpro/client-framework";
import type { Notifier } from "@sincpro/mobile/domain/notifier";
import type { BluetoothDevice, ISelectedPrinter } from "@sincpro/mobile/domain/print";
import { BluetoothPermissionDenied } from "@sincpro/mobile/exceptions";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";
import { PRINT_NOTICE_ACTIONS } from "@sincpro/mobile/services/printer.service";

export class CommandConnectPrinter extends Command<void> {
  constructor(
    readonly address: string,
    readonly name: string,
  ) {
    super();
  }
}

export class CommandDisconnectPrinter extends Command<void> {}

export class CommandScanPrinters extends Command<BluetoothDevice[]> {}

/** What the printer settings show: Bluetooth granted, the printer chosen, and its link. */
export type PrinterStatus = {
  readonly bluetoothGranted: boolean;
  readonly selected: ISelectedPrinter | null;
  readonly connected: boolean;
};

export class CommandPrinterStatus extends Command<PrinterStatus> {}

export class CommandRestorePrinterConnection extends Command<void> {}

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

/**
 * Connects to a printer the person picked and keeps it as the chosen one:
 * 1. Without the Bluetooth permission: the person is told, and it fails `permission_denied`.
 * 2. A printer that does not answer: the person is told, with a way to the printer's settings,
 *    and it fails `unavailable`.
 * Final: connected — the person is told.
 */
@commonBoundedContext.feature(CommandConnectPrinter)
export class ConnectPrinter extends Feature<CommandConnectPrinter, void> {
  async execute(command: CommandConnectPrinter): Promise<void> {
    this.span.set({ "printer.name": command.name });
    try {
      await this.printer.connect(command.address, command.name);
    } catch (error) {
      if (!toldBluetoothDenied(error, this.notifier)) {
        this.notifier.notify({
          name: "printer.connect_failed",
          title: "Error de conexión",
          message: `No se pudo conectar a ${command.name}`,
          variant: "danger",
          actions: [PRINT_NOTICE_ACTIONS.printer],
        });
      }
      throw error;
    }
    this.notifier.notify({
      name: "printer.connected",
      title: "Impresora conectada",
      message: `Conectado a ${command.name}`,
      variant: "success",
    });
  }
}

/** Disconnects the printer on purpose: nothing reconnects it until the person connects again. */
@commonBoundedContext.feature(CommandDisconnectPrinter)
export class DisconnectPrinter extends Feature<CommandDisconnectPrinter, void> {
  async execute(): Promise<void> {
    await this.printer.disconnect();
    this.notifier.notify({
      name: "printer.disconnected",
      title: "Desconectado",
      message: "Impresora desconectada",
      variant: "info",
    });
  }
}

/** The printers in reach; without the Bluetooth permission the person is told and it fails. */
@commonBoundedContext.feature(CommandScanPrinters)
export class ScanPrinters extends Feature<CommandScanPrinters, BluetoothDevice[]> {
  async execute(): Promise<BluetoothDevice[]> {
    try {
      const found = await this.printer.scanPrinters();
      this.span.set({ "printer.found": found.length });
      return found;
    } catch (error) {
      toldBluetoothDenied(error, this.notifier);
      throw error;
    }
  }
}

/** Bluetooth's permission, the chosen printer and whether it is connected — never asking. */
@commonBoundedContext.feature(CommandPrinterStatus)
export class ReadPrinterStatus extends Feature<CommandPrinterStatus, PrinterStatus> {
  async execute(): Promise<PrinterStatus> {
    const permissions = await this.bluetooth.checkPermissions();
    const status = {
      bluetoothGranted: permissions.isGranted,
      selected: await this.printer.getSelectedPrinter(),
      connected: this.printer.isConnected(),
    };
    this.span.set({
      "bluetooth.granted": status.bluetoothGranted,
      "printer.selected": status.selected !== null,
      "printer.connected": status.connected,
    });
    return status;
  }
}

/**
 * One silent try to bring back the chosen printer — what the reconnection loop executes while
 * the app runs: nothing is shown; a printer that does not come back fails `unavailable`, and the
 * loop tries again later.
 */
@commonBoundedContext.feature(CommandRestorePrinterConnection)
export class RestorePrinterConnection extends Feature<CommandRestorePrinterConnection, void> {
  execute(): Promise<void> {
    return this.printer.restoreConnection();
  }
}
