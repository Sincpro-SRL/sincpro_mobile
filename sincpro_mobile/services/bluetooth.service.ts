import { logger } from "@sincpro/client-framework";
import { BluetoothAdapter } from "@sincpro/mobile/adapters/Bluetooth.adapter";
import {
  BluetoothPermissionStatus,
  BluetoothStatus,
} from "@sincpro/mobile/domain/connectivity";
import { replaceable } from "@sincpro/mobile/framework/replaceable";
import { notifyDevice } from "@sincpro/mobile/infrastructure/ui/activity";

export class BluetoothService {
  private permissionStatus: BluetoothPermissionStatus | null = null;

  async requestPermissions(): Promise<BluetoothPermissionStatus> {
    logger.info("Requesting Bluetooth permissions");

    const permissions = await BluetoothAdapter.requestPermissions();
    this.permissionStatus = permissions;

    this.showPermissionToast(permissions);

    return permissions;
  }

  async checkPermissions(): Promise<BluetoothPermissionStatus> {
    logger.info("Checking Bluetooth permissions");

    const permissions = await BluetoothAdapter.hasPermissions();
    this.permissionStatus = permissions;

    return permissions;
  }

  async getStatus(): Promise<BluetoothStatus> {
    logger.info("Getting Bluetooth status");
    return BluetoothAdapter.getStatus();
  }

  async ensurePermissions(): Promise<boolean> {
    logger.info("Ensuring Bluetooth permissions are granted");

    const currentPermissions = await this.checkPermissions();

    if (currentPermissions.isGranted) {
      logger.info("Bluetooth permissions already granted");
      return true;
    }

    logger.info("Bluetooth permissions not granted, requesting...");
    const requestedPermissions = await this.requestPermissions();

    return requestedPermissions.isGranted;
  }

  async ensurePermissionsForPrinter(): Promise<boolean> {
    logger.info("Ensuring Bluetooth permissions for printer connection");

    const permissions = await this.ensurePermissions();

    if (!permissions) {
      notifyDevice({
        name: "bluetooth.required",
        title: "Permisos de Bluetooth requeridos",
        message: "Habilita los permisos de Bluetooth en configuración",
        variant: "danger",
      });
    }

    return permissions;
  }

  getCachedPermissions(): BluetoothPermissionStatus | null {
    return this.permissionStatus;
  }

  isPermissionGranted(): boolean {
    return this.permissionStatus?.isGranted ?? false;
  }

  private showPermissionToast(permissions: BluetoothPermissionStatus): void {
    if (permissions.isGranted) {
      notifyDevice({
        name: "bluetooth.enabled",
        title: "Bluetooth habilitado",
        message: "Permisos de Bluetooth concedidos",
        variant: "success",
      });
      logger.info("Bluetooth permissions granted");
    } else {
      notifyDevice({
        name: "bluetooth.denied",
        title: "Bluetooth no disponible",
        message: "Los permisos de Bluetooth fueron denegados",
        variant: "danger",
      });
      logger.warn("Bluetooth permissions denied", {
        permissions: JSON.stringify(permissions),
      });
    }
  }
}

const bluetoothServiceSlot = replaceable(new BluetoothService());

/** Swaps the implementation for a subclass, for the whole app and the core. */
export function setBluetoothService(service: BluetoothService): void {
  bluetoothServiceSlot.set(service);
}

export const bluetoothService: BluetoothService = bluetoothServiceSlot.instance;
