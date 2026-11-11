import { Command } from "@sincpro/client-framework";
import type { BluetoothPermissionStatus } from "@sincpro/mobile/domain/connectivity";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

export class CommandRequestBluetoothPermission extends Command<BluetoothPermissionStatus> {}

export class CommandCheckBluetoothPermission extends Command<BluetoothPermissionStatus> {}

/**
 * Asks the person for Bluetooth (the system's dialog) and tells them what it means: granted, the
 * printer can connect; denied, it cannot. A denial is the person's answer, not a failure: the
 * run answers the status, and its span says whether it was granted.
 */
@commonBoundedContext.feature(CommandRequestBluetoothPermission)
export class RequestBluetoothPermission extends Feature<
  CommandRequestBluetoothPermission,
  BluetoothPermissionStatus
> {
  async execute(): Promise<BluetoothPermissionStatus> {
    const permissions = await this.bluetooth.requestPermissions();
    this.span.set({ "bluetooth.granted": permissions.isGranted });
    if (permissions.isGranted) {
      this.notifier.notify({
        name: "bluetooth.enabled",
        title: "Bluetooth habilitado",
        message: "Permisos de Bluetooth concedidos",
        variant: "success",
      });
    } else {
      this.logger.warn("Bluetooth permission denied");
      this.notifier.notify({
        name: "bluetooth.denied",
        title: "Bluetooth no disponible",
        message: "Los permisos de Bluetooth fueron denegados",
        variant: "danger",
      });
    }
    return permissions;
  }
}

/** What the Bluetooth permission is now, without asking. */
@commonBoundedContext.feature(CommandCheckBluetoothPermission)
export class CheckBluetoothPermission extends Feature<
  CommandCheckBluetoothPermission,
  BluetoothPermissionStatus
> {
  async execute(): Promise<BluetoothPermissionStatus> {
    const permissions = await this.bluetooth.checkPermissions();
    this.span.set({ "bluetooth.granted": permissions.isGranted });
    return permissions;
  }
}
