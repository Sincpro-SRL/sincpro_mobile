import { Command } from "@sincpro/client-framework";
import type { NetworkStatus } from "@sincpro/mobile/domain/connectivity";
import { InternetIsDownEvent, InternetIsUpEvent } from "@sincpro/mobile/domain/events";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

export class CommandCheckConnectivity extends Command<NetworkStatus> {}

/**
 * Reads the phone's connection — what the core's cron executes every few minutes:
 * 1. The screens and the queue hear whether it is up or down (`InternetIsUp` / `InternetIsDown`).
 * Final: when it changed, the person is told.
 */
@commonBoundedContext.feature(CommandCheckConnectivity)
export class CheckConnectivity extends Feature<CommandCheckConnectivity, NetworkStatus> {
  async execute(): Promise<NetworkStatus> {
    const { status, changed } = await this.network.read();
    this.span.set({ "network.connected": status.isConnected, "network.type": status.type });
    this.uiEvents.emit(
      status.isConnected ? InternetIsUpEvent.eventName : InternetIsDownEvent.eventName,
      status.isConnected,
    );
    if (changed) this.notifyChange(status);
    return status;
  }

  private notifyChange(status: NetworkStatus): void {
    if (status.isConnected) {
      this.logger.info("Network is up", { type: status.type });
      this.notifier.notify({
        name: "network.online",
        title: "Conectado",
        message: `Conexión a través de ${status.type}`,
        variant: "success",
      });
    } else {
      this.logger.warn("Network is down", { type: status.type });
      this.notifier.notify({
        name: "network.offline",
        title: "Estás desconectado",
        message: "Sin conexión a internet",
        variant: "danger",
      });
    }
  }
}
