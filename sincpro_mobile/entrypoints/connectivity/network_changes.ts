import { networkAdapter } from "@sincpro/mobile/adapters/Network.adapter";
import { commonBoundedContext } from "@sincpro/mobile/services";
import { CommandCheckConnectivity } from "@sincpro/mobile/services/connectivity/check_connectivity.feature";

let stop: (() => void) | undefined;

/**
 * An entrypoint: every change of network the phone reports executes the core's use case, so the
 * queue and the screens hear it at once — what waits for the connection goes when it comes back.
 * The cron (`CHECK_NETWORK`) stays as the backstop. Once per JS context.
 */
export function listenToNetworkChanges(): void {
  if (stop) return;
  stop = networkAdapter.onChange(() => {
    // The run records its own failure; nobody waits for this one.
    commonBoundedContext.execute(new CommandCheckConnectivity()).catch(() => undefined);
  });
}
