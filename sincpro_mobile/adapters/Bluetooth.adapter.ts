import {
  BluetoothPermissionStatus,
  BluetoothState,
  BluetoothStatus,
} from "@sincpro/mobile/domain/connectivity";
import { PermissionsAndroid, Platform } from "react-native";

const ANDROID_12_API_LEVEL = 31;

class BluetoothAdapterImpl {
  async requestPermissions(): Promise<BluetoothPermissionStatus> {
    if (Platform.OS === "android") {
      return this.requestAndroidPermissions();
    }

    if (Platform.OS === "ios") {
      return this.requestIOSPermissions();
    }

    return { scan: false, connect: false, advertise: false, isGranted: false };
  }

  async hasPermissions(): Promise<BluetoothPermissionStatus> {
    if (Platform.OS === "android") {
      return this.checkAndroidPermissions();
    }

    if (Platform.OS === "ios") {
      return this.checkIOSPermissions();
    }

    return { scan: false, connect: false, advertise: false, isGranted: false };
  }

  async getStatus(): Promise<BluetoothStatus> {
    const permissions = await this.hasPermissions();
    const state: BluetoothState = permissions.isGranted ? "PoweredOn" : "Unauthorized";

    return {
      isEnabled: permissions.isGranted,
      state,
      permissions,
    };
  }

  isAndroid12OrHigher(): boolean {
    return Platform.OS === "android" && Platform.Version >= ANDROID_12_API_LEVEL;
  }

  getPlatform(): "android" | "ios" | "other" {
    if (Platform.OS === "android") return "android";
    if (Platform.OS === "ios") return "ios";
    return "other";
  }

  private async requestAndroidPermissions(): Promise<BluetoothPermissionStatus> {
    if (Platform.OS !== "android") {
      return { scan: true, connect: true, advertise: true, isGranted: true };
    }

    if (Platform.Version < ANDROID_12_API_LEVEL) {
      const locationGranted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      const isGranted = locationGranted === PermissionsAndroid.RESULTS.GRANTED;
      return { scan: isGranted, connect: isGranted, advertise: isGranted, isGranted };
    }

    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
    ]);

    const scan =
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
      PermissionsAndroid.RESULTS.GRANTED;
    const connect =
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
      PermissionsAndroid.RESULTS.GRANTED;
    const advertise =
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE] ===
      PermissionsAndroid.RESULTS.GRANTED;

    return {
      scan,
      connect,
      advertise,
      isGranted: scan && connect,
    };
  }

  private async checkAndroidPermissions(): Promise<BluetoothPermissionStatus> {
    if (Platform.OS !== "android") {
      return { scan: true, connect: true, advertise: true, isGranted: true };
    }

    if (Platform.Version < ANDROID_12_API_LEVEL) {
      const locationGranted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      return {
        scan: locationGranted,
        connect: locationGranted,
        advertise: locationGranted,
        isGranted: locationGranted,
      };
    }

    const [scan, connect, advertise] = await Promise.all([
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN),
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT),
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE),
    ]);

    return {
      scan,
      connect,
      advertise,
      isGranted: scan && connect,
    };
  }

  private async requestIOSPermissions(): Promise<BluetoothPermissionStatus> {
    return { scan: true, connect: true, advertise: true, isGranted: true };
  }

  private async checkIOSPermissions(): Promise<BluetoothPermissionStatus> {
    return { scan: true, connect: true, advertise: true, isGranted: true };
  }
}

export const BluetoothAdapter = new BluetoothAdapterImpl();
