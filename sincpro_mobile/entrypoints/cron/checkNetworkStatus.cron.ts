import { logger } from "@sincpro/client-framework";
import { EBuiltinCron } from "@sincpro/mobile/entrypoints/cron/EBuiltinCron";
import { CronWorker } from "@sincpro/mobile/infrastructure/workers";
import { networkUseCases } from "@sincpro/mobile/services/network.service";

async function checkNetworkStatus(): Promise<void> {
  logger.info("Checking network status");
  await networkUseCases.getNetworkStatus();
  logger.info("Finished checking network status");
}

const cronCheckNetworkStatus = new CronWorker(
  EBuiltinCron.CHECK_NETWORK,
  checkNetworkStatus,
  2.5,
);

export default cronCheckNetworkStatus;
