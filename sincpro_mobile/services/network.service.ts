import { NetworkAdapter } from "@sincpro/mobile/adapters/Network.adapter";
import { NetworkStatus } from "@sincpro/mobile/domain/connectivity";
import { InternetIsDownEvent, InternetIsUpEvent } from "@sincpro/mobile/domain/events";
import { replaceable } from "@sincpro/mobile/framework/replaceable";
import { UIEventBus } from "@sincpro/mobile/infrastructure/ui/UIEventBus";

/** What a read of the connection found, and whether it changed since the last one. */
export type ConnectivityReading = {
  readonly status: NetworkStatus;
  readonly changed: boolean;
};

/**
 * The phone's connection — the adapter `CheckConnectivity` holds (`this.connectivity`): it reads
 * the platform, tells the screens and the queue (`InternetIsUp` / `InternetIsDown` on
 * `UIEventBus`) and remembers the last reading. What the person reads about a change is the
 * use case's.
 */
export class NetworkUseCases {
  private networkStatus: NetworkStatus | null = null;

  async read(): Promise<ConnectivityReading> {
    const status = await NetworkAdapter.getStatus();
    UIEventBus.emit(
      status.isConnected ? InternetIsUpEvent.eventName : InternetIsDownEvent.eventName,
      status.isConnected,
    );
    const changed = status.isConnected !== this.networkStatus?.isConnected;
    this.networkStatus = status;
    return { status, changed };
  }

  async getNetworkStatus(): Promise<NetworkStatus> {
    return (await this.read()).status;
  }
}

const networkUseCasesSlot = replaceable(new NetworkUseCases());

/** Swaps the implementation for a subclass, for the whole app and the core. */
export function setNetworkUseCases(service: NetworkUseCases): void {
  networkUseCasesSlot.set(service);
}

export const networkUseCases: NetworkUseCases = networkUseCasesSlot.instance;
