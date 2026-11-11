import { logger } from "@sincpro/client-framework";
import { NetworkAdapter } from "@sincpro/mobile/adapters/Network.adapter";
import { NetworkStatus } from "@sincpro/mobile/domain/connectivity";
import { InternetIsDownEvent, InternetIsUpEvent } from "@sincpro/mobile/domain/events";
import { replaceable } from "@sincpro/mobile/framework/replaceable";
import { notifyDevice } from "@sincpro/mobile/infrastructure/ui/activity";
import { UIEventBus } from "@sincpro/mobile/infrastructure/ui/UIEventBus";

export class NetworkUseCases {
  private networkStatus: NetworkStatus | null = null;

  async getNetworkStatus(): Promise<NetworkStatus> {
    const networkStatus = await NetworkAdapter.getStatus();
    if (networkStatus.isConnected) {
      UIEventBus.emit(InternetIsUpEvent.name, true);
    } else {
      UIEventBus.emit(InternetIsDownEvent.name, false);
    }
    this.notifyOnChange(networkStatus);
    this.networkStatus = networkStatus;
    return this.networkStatus;
  }

  private notifyOnChange(networkStatus: NetworkStatus): void {
    const changed = networkStatus.isConnected !== this.networkStatus?.isConnected;

    if (!changed) {
      return;
    }

    if (!networkStatus.isConnected) {
      logger.warn(`Network is down: ${networkStatus.type}`);
      notifyDevice({
        name: "network.offline",
        title: "Estas desconectado",
        message: "Sin conexión a internet",
        variant: "danger",
      });
    } else {
      logger.info(`Network is up: ${networkStatus.type}`);
      notifyDevice({
        name: "network.online",
        title: "Conectado",
        message: `Conexión a través de ${networkStatus.type}`,
        variant: "success",
      });
    }
  }
}

const networkUseCasesSlot = replaceable(new NetworkUseCases());

/** Swaps the implementation for a subclass, for the whole app and the core. */
export function setNetworkUseCases(service: NetworkUseCases): void {
  networkUseCasesSlot.set(service);
}

export const networkUseCases: NetworkUseCases = networkUseCasesSlot.instance;
