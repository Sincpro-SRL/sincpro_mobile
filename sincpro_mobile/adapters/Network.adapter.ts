import type {
  ConnectivityConfig,
  NetworkStatus,
  NetworkType,
} from "@sincpro/mobile/domain/connectivity";
import * as Network from "expo-network";

/** What a read of the connection found, and whether it changed since the last one. */
export type ConnectivityReading = {
  readonly status: NetworkStatus;
  readonly changed: boolean;
};

/**
 * The phone's connection — the adapter `CheckConnectivity` holds (`this.network`): it reads the
 * platform and remembers the last reading, device state an adapter may hold in the process.
 * Who hears a change, and what the person reads, is the use case's.
 */
export class NetworkAdapter {
  private last: NetworkStatus | null = null;
  private check: ConnectivityConfig["check"];

  /** The app's proof of internet (`AppConfig.connectivity`); the phone's reading alone without it. */
  configure(config: ConnectivityConfig = {}): void {
    this.check = config.check;
  }

  /**
   * The phone's connection: connected means there is internet — a network, reachable when the
   * phone knows, and the app's `check` when it gives one.
   */
  async getStatus(): Promise<NetworkStatus> {
    const state = await Network.getNetworkStateAsync();
    const ip = await Network.getIpAddressAsync();
    const reachable = (state.isConnected ?? false) && state.isInternetReachable !== false;
    return {
      isConnected: reachable && (await this.proven()),
      isInternetReachable: state.isInternetReachable ?? null,
      type: state.type as NetworkType,
      ipAddress: ip ?? null,
    };
  }

  /** What a read found, and whether it changed since the last one. */
  async read(): Promise<ConnectivityReading> {
    const status = await this.getStatus();
    const changed = status.isConnected !== this.last?.isConnected;
    this.last = status;
    return { status, changed };
  }

  /** Calls `listener` on every change the phone reports — at once, not on the next cron tick. */
  onChange(listener: () => void): () => void {
    const subscription = Network.addNetworkStateListener(() => listener());
    return () => subscription.remove();
  }

  private async proven(): Promise<boolean> {
    if (!this.check) return true;
    try {
      return await this.check();
    } catch {
      return false;
    }
  }
}

/** The core's network: what `commonBoundedContext` holds as `network`. */
export const networkAdapter = new NetworkAdapter();
