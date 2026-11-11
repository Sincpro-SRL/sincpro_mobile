import { Command } from "@sincpro/client-framework";
import type { BluetoothDevice } from "@sincpro/mobile/domain/print";
import { BluetoothPermissionDenied } from "@sincpro/mobile/exceptions";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";
import { BLUETOOTH_REQUIRED } from "@sincpro/mobile/services/printer/common";

export class CommandScanPrinters extends Command<BluetoothDevice[]> {}

/** The printers in reach; without the Bluetooth permission the person is told and it fails. */
@commonBoundedContext.feature(CommandScanPrinters)
export class ScanPrinters extends Feature<CommandScanPrinters, BluetoothDevice[]> {
  async execute(): Promise<BluetoothDevice[]> {
    try {
      const found = await this.printer.scanPrinters();
      this.span.set({ "printer.found": found.length });
      return found;
    } catch (error) {
      if (error instanceof BluetoothPermissionDenied)
        this.notifier.notify(BLUETOOTH_REQUIRED);
      throw error;
    }
  }
}
