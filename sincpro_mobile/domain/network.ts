export type NetworkType =
  | "UNKNOWN"
  | "NONE"
  | "WIFI"
  | "CELLULAR"
  | "ETHERNET"
  | "WIMAX"
  | "BLUETOOTH"
  | "VPN"
  | "OTHER";

export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: NetworkType;
  ipAddress: string | null;
}
