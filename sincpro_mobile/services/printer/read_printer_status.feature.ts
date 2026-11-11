import { Command } from "@sincpro/client-framework";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";
import type { PrinterStatus } from "@sincpro/mobile/services/printer/common";

export class CommandPrinterStatus extends Command<PrinterStatus> {}

/** Bluetooth's permission, the chosen printer and whether it is connected — never asking. */
@commonBoundedContext.feature(CommandPrinterStatus)
export class ReadPrinterStatus extends Feature<CommandPrinterStatus, PrinterStatus> {
  async execute(): Promise<PrinterStatus> {
    const permissions = await this.bluetooth.hasPermissions();
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
