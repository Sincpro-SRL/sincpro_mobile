import { NetworkAdapter } from "@sincpro/mobile/adapters/Network.adapter";
import { NetworkStatus } from "@sincpro/mobile/domain/connectivity";
import { InternetIsDownEvent, InternetIsUpEvent } from "@sincpro/mobile/domain/events";
import { loggerUseCases } from "@sincpro/mobile/infrastructure/logger";
import { UI_NOTIFICATION_EVENT } from "@sincpro/mobile/infrastructure/ui/events";
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
    this.showToastNotification(networkStatus);
    this.networkStatus = networkStatus;
    return this.networkStatus;
  }

  async showToastNotification(networkStatus: NetworkStatus): Promise<void> {
    const showToast = networkStatus.isConnected !== this.networkStatus?.isConnected;

    if (!showToast) {
      return;
    }

    if (!networkStatus.isConnected) {
      loggerUseCases.info(`Network is up: ${networkStatus.type}`);
      UIEventBus.emit(UI_NOTIFICATION_EVENT, {
        type: "error",
        text1: "Estas desconectado",
        text2: "Sin conexión a internet",
      });
    } else {
      loggerUseCases.warn(`Network is down: ${networkStatus.type}`);
      UIEventBus.emit(UI_NOTIFICATION_EVENT, {
        type: "success",
        text1: "Conectado",
        text2: `Conexión a través de ${networkStatus.type}`,
      });
    }
  }
}

export const networkUseCases = new NetworkUseCases();
