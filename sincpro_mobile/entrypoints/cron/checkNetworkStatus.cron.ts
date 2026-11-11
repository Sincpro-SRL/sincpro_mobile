import { EBuiltinCron } from "@sincpro/mobile/entrypoints/cron/EBuiltinCron";
import { CronWorker } from "@sincpro/mobile/infrastructure/workers";
import { commonBoundedContext } from "@sincpro/mobile/services";
import { CommandCheckConnectivity } from "@sincpro/mobile/services/connectivity/check_connectivity.feature";

/** An entrypoint: each tick executes the use case, traced and reported as any other. */
const cronCheckNetworkStatus = new CronWorker(
  EBuiltinCron.CHECK_NETWORK,
  async () => {
    await commonBoundedContext.execute(new CommandCheckConnectivity());
  },
  2.5,
);

export default cronCheckNetworkStatus;
