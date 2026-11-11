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
  execute(): Promise<NetworkStatus> {
    return this.connectivity.getNetworkStatus();
  }
}
