import { BluetoothAdapter } from "@sincpro/mobile/adapters/Bluetooth.adapter";
import {
  BluetoothPermissionStatus,
  BluetoothStatus,
} from "@sincpro/mobile/domain/connectivity";
import { loggerUseCases } from "@sincpro/mobile/infrastructure/logger";
import { UI_NOTIFICATION_EVENT } from "@sincpro/mobile/infrastructure/ui/events";
import { UIEventBus } from "@sincpro/mobile/infrastructure/ui/UIEventBus";

class BluetoothService {
  private permissionStatus: BluetoothPermissionStatus | null = null;

  async requestPermissions(): Promise<BluetoothPermissionStatus> {
    loggerUseCases.info("Requesting Bluetooth permissions");

    const permissions = await BluetoothAdapter.requestPermissions();
    this.permissionStatus = permissions;

    this.showPermissionToast(permissions);

    return permissions;
  }

  async checkPermissions(): Promise<BluetoothPermissionStatus> {
    loggerUseCases.info("Checking Bluetooth permissions");

    const permissions = await BluetoothAdapter.hasPermissions();
    this.permissionStatus = permissions;

    return permissions;
  }

  async getStatus(): Promise<BluetoothStatus> {
    loggerUseCases.info("Getting Bluetooth status");
    return BluetoothAdapter.getStatus();
  }

  async ensurePermissions(): Promise<boolean> {
    loggerUseCases.info("Ensuring Bluetooth permissions are granted");

    const currentPermissions = await this.checkPermissions();

    if (currentPermissions.isGranted) {
      loggerUseCases.info("Bluetooth permissions already granted");
      return true;
    }

    loggerUseCases.info("Bluetooth permissions not granted, requesting...");
    const requestedPermissions = await this.requestPermissions();

    return requestedPermissions.isGranted;
  }

  async ensurePermissionsForPrinter(): Promise<boolean> {
    loggerUseCases.info("Ensuring Bluetooth permissions for printer connection");

    const permissions = await this.ensurePermissions();

    if (!permissions) {
      UIEventBus.emit(UI_NOTIFICATION_EVENT, {
        type: "error",
        text1: "Permisos de Bluetooth requeridos",
        text2: "Habilita los permisos de Bluetooth en configuración",
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
      UIEventBus.emit(UI_NOTIFICATION_EVENT, {
        type: "success",
        text1: "Bluetooth habilitado",
        text2: "Permisos de Bluetooth concedidos",
      });
      loggerUseCases.info("Bluetooth permissions granted");
    } else {
      UIEventBus.emit(UI_NOTIFICATION_EVENT, {
        type: "error",
        text1: "Bluetooth no disponible",
        text2: "Los permisos de Bluetooth fueron denegados",
      });
      loggerUseCases.warn("Bluetooth permissions denied", { permissions });
    }
  }
}

export const bluetoothService = new BluetoothService();
