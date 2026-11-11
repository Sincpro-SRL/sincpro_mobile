import { NetworkStatus, NetworkType } from "@sincpro/mobile/domain/connectivity";
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

  async getStatus(): Promise<NetworkStatus> {
    const state = await Network.getNetworkStateAsync();
    const ip = await Network.getIpAddressAsync();

    return {
      isConnected: state.isConnected ?? false,
      isInternetReachable: state.isInternetReachable ?? null,
      type: state.type as NetworkType,
      ipAddress: ip ?? null,
    };
  }

  /** Reads the connection and says whether it is up or down where it was not before. */
  async read(): Promise<ConnectivityReading> {
    const status = await this.getStatus();
    const changed = status.isConnected !== this.last?.isConnected;
    this.last = status;
    return { status, changed };
  }
}

/** The core's network: what `commonBoundedContext` holds as `network`. */
export const networkAdapter = new NetworkAdapter();
