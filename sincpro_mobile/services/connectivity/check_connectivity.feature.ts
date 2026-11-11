import { Command } from "@sincpro/client-framework";
import type { NetworkStatus } from "@sincpro/mobile/domain/connectivity";
import { commonBoundedContext, Feature } from "@sincpro/mobile/infrastructure/framework";

export class CommandCheckConnectivity extends Command<NetworkStatus> {}

/**
 * Reads the phone's connection — what the core's cron executes every few minutes: the screens
 * and the queue hear whether it is up or down, and the person is told when it changes.
 */
@commonBoundedContext.feature(CommandCheckConnectivity)
export class CheckConnectivity extends Feature<CommandCheckConnectivity, NetworkStatus> {
  async execute(): Promise<NetworkStatus> {
    const { status, changed } = await this.connectivity.read();
    this.span.set({ "network.connected": status.isConnected, "network.type": status.type });
    if (!changed) return status;
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
    return status;
  }
}
