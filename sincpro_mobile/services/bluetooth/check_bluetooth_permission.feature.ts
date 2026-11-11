import { Command } from "@sincpro/client-framework";
import type { BluetoothPermissionStatus } from "@sincpro/mobile/domain/connectivity";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

export class CommandCheckBluetoothPermission extends Command<BluetoothPermissionStatus> {}

/** What the Bluetooth permission is now, without asking. */
@commonBoundedContext.feature(CommandCheckBluetoothPermission)
export class CheckBluetoothPermission extends Feature<
  CommandCheckBluetoothPermission,
  BluetoothPermissionStatus
> {
  async execute(): Promise<BluetoothPermissionStatus> {
    const permissions = await this.bluetooth.hasPermissions();
    this.span.set({ "bluetooth.granted": permissions.isGranted });
    return permissions;
  }
}
