import { Command } from "@sincpro/client-framework";
import { EPermission } from "@sincpro/mobile/domain/permissions";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";
import type { PrinterStatus } from "@sincpro/mobile/services/printer/common";

export class CommandPrinterStatus extends Command<PrinterStatus> {}

/** Bluetooth's permission, the chosen printer and whether it is connected — never asking. */
@commonBoundedContext.feature(CommandPrinterStatus)
export class ReadPrinterStatus extends Feature<CommandPrinterStatus, PrinterStatus> {
  async execute(): Promise<PrinterStatus> {
    const bluetooth = await this.permissions.check(EPermission.BLUETOOTH);
    this.permissionStates.set(EPermission.BLUETOOTH, bluetooth);
    const status = {
      bluetoothGranted: bluetooth === "granted",
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
