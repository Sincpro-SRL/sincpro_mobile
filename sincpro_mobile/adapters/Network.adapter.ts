import { NetworkStatus, NetworkType } from "@sincpro/mobile/domain/connectivity";
import * as Network from "expo-network";

export const NetworkAdapter = {
  async getStatus(): Promise<NetworkStatus> {
    const state = await Network.getNetworkStateAsync();
    const ip = await Network.getIpAddressAsync();

    return {
      isConnected: state.isConnected ?? false,
      isInternetReachable: state.isInternetReachable ?? null,
      type: state.type as NetworkType,
      ipAddress: ip ?? null,
    };
  },
};
