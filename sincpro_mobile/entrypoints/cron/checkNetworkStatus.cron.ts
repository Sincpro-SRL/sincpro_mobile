import { loggerCronJobs } from "@sincpro/mobile/infrastructure/logger";
import { CronWorker } from "@sincpro/mobile/infrastructure/workers";
import { networkUseCases } from "@sincpro/mobile/services/network.service";

async function checkNetworkStatus(): Promise<void> {
  loggerCronJobs.info("Checking network status");
  await networkUseCases.getNetworkStatus();
  loggerCronJobs.info("Finished checking network status");
}

const cronCheckNetworkStatus = new CronWorker(
  "CHECK_NETWORK",
  checkNetworkStatus,
  2.5,
  false,
  "Verificando red",
);

export default cronCheckNetworkStatus;
