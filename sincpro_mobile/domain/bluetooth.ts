export type BluetoothState =
  | "Unknown"
  | "Resetting"
  | "Unsupported"
  | "Unauthorized"
  | "PoweredOff"
  | "PoweredOn";

export interface BluetoothDevice {
  id: string;
  name: string | null;
  address: string;
  rssi?: number;
  isConnected: boolean;
}

export interface BluetoothPermissionStatus {
  scan: boolean;
  connect: boolean;
  advertise: boolean;
  isGranted: boolean;
}

export interface BluetoothStatus {
  isEnabled: boolean;
  state: BluetoothState;
  permissions: BluetoothPermissionStatus;
}
