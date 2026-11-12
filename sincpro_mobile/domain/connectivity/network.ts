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
  /** There is internet: a network, reachable, and the app's own proof when it gives one. */
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: NetworkType;
  ipAddress: string | null;
}

/**
 * How an app knows there is internet, beyond the phone's reading — every key optional:
 *
 *     connectivity: { check: async () => (await fetch(`${server}/health`)).ok }
 *
 * `check` is the app's proof (its server answers); without it, a network the phone says is
 * reachable is enough. A `check` that throws or does not answer means no internet.
 */
export type ConnectivityConfig = {
  readonly check?: () => Promise<boolean>;
};
