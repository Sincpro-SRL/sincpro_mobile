export interface BluetoothDevice {
  id: string;
  name: string | null;
  address: string;
  rssi?: number;
  isConnected: boolean;
}
