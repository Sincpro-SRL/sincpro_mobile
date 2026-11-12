import {
  type DevicePermissions,
  EPermission,
  type PermissionStatus,
} from "@sincpro/mobile/domain/permissions";
import * as Location from "expo-location";
import { Linking, type Permission, PermissionsAndroid, Platform } from "react-native";

const ANDROID_12_API_LEVEL = 31;

/** How one permission is read and asked for on this platform. */
interface PermissionSource {
  check(): Promise<PermissionStatus>;
  request(): Promise<PermissionStatus>;
}

function locationStatus(response: Location.LocationPermissionResponse): PermissionStatus {
  if (response.granted) return "granted";
  return response.canAskAgain ? "denied" : "blocked";
}

const location: PermissionSource = {
  check: async () => locationStatus(await Location.getForegroundPermissionsAsync()),
  request: async () => locationStatus(await Location.requestForegroundPermissionsAsync()),
};

/** What Android asks for to scan and connect: Nearby devices from 12, fine location before. */
function androidBluetoothPermissions(): Permission[] {
  return Number(Platform.Version) >= ANDROID_12_API_LEVEL
    ? [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]
    : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
}

/**
 * Bluetooth: Android asks for it with its own dialog; iOS asks the first time the printer's
 * driver uses it, so for the app it is granted; any other platform has none.
 */
const bluetooth: PermissionSource = {
  async check() {
    if (Platform.OS === "ios") return "granted";
    if (Platform.OS !== "android") return "unavailable";
    const granted = await Promise.all(
      androidBluetoothPermissions().map(PermissionsAndroid.check),
    );
    return granted.every(Boolean) ? "granted" : "denied";
  },
  async request() {
    if (Platform.OS === "ios") return "granted";
    if (Platform.OS !== "android") return "unavailable";
    const answers = Object.values(
      await PermissionsAndroid.requestMultiple(androidBluetoothPermissions()),
    );
    if (answers.every((answer) => answer === PermissionsAndroid.RESULTS.GRANTED))
      return "granted";
    return answers.includes(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)
      ? "blocked"
      : "denied";
  },
};

/**
 * The phone's permissions (`DevicePermissions`), each read and asked for its own way. It never
 * decides when to ask: only `CommandRequestPermission` calls `request`, after a person acted.
 */
export class DevicePermissionsAdapter implements DevicePermissions {
  private readonly sources: Record<EPermission, PermissionSource> = {
    [EPermission.BLUETOOTH]: bluetooth,
    [EPermission.LOCATION]: location,
  };

  check(kind: EPermission): Promise<PermissionStatus> {
    return this.sources[kind].check();
  }

  request(kind: EPermission): Promise<PermissionStatus> {
    return this.sources[kind].request();
  }

  openSettings(): Promise<void> {
    return Linking.openSettings();
  }
}

/** The core's permissions: what `commonBoundedContext` holds as `permissions`. */
export const devicePermissions = new DevicePermissionsAdapter();
