import { loggerAdapter } from "@sincpro/client-framework";
import { BluetoothAdapter } from "@sincpro/mobile/adapters/Bluetooth.adapter";
import {
  BluetoothPermissionStatus,
  BluetoothStatus,
} from "@sincpro/mobile/domain/connectivity";
import { replaceable } from "@sincpro/mobile/framework/replaceable";

/**
 * Bluetooth's permissions and status — the adapter the use cases hold (`this.bluetooth`): it
 * asks the platform and remembers the last answer. What the person reads about it is a use
 * case's (`services/bluetooth`), so asking for the permission is a run with its span.
 */
export class BluetoothService {
  private permissionStatus: BluetoothPermissionStatus | null = null;

  /** Asks the person for the permission (the system's dialog). */
  async requestPermissions(): Promise<BluetoothPermissionStatus> {
    const permissions = await BluetoothAdapter.requestPermissions();
    this.permissionStatus = permissions;
    loggerAdapter.info("Bluetooth permission asked", { granted: permissions.isGranted });
    return permissions;
  }

  /** What the permission is now, without asking. */
  async checkPermissions(): Promise<BluetoothPermissionStatus> {
    const permissions = await BluetoothAdapter.hasPermissions();
    this.permissionStatus = permissions;
    return permissions;
  }

  async getStatus(): Promise<BluetoothStatus> {
    return BluetoothAdapter.getStatus();
  }

  /** Whether it is granted — asking for it when it is not. */
  async ensurePermissions(): Promise<boolean> {
    if ((await this.checkPermissions()).isGranted) return true;
    return (await this.requestPermissions()).isGranted;
  }

  getCachedPermissions(): BluetoothPermissionStatus | null {
    return this.permissionStatus;
  }

  isPermissionGranted(): boolean {
    return this.permissionStatus?.isGranted ?? false;
  }
}

const bluetoothServiceSlot = replaceable(new BluetoothService());

/** Swaps the implementation for a subclass, for the whole app and the core. */
export function setBluetoothService(service: BluetoothService): void {
  bluetoothServiceSlot.set(service);
}

export const bluetoothService: BluetoothService = bluetoothServiceSlot.instance;
