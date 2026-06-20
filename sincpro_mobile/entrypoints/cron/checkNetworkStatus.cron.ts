import { loggerCronJobs } from "../../infrastructure/logger";
import { CronWorker } from "../../infrastructure/workers";
import { networkUseCases } from "../../services/network.service";

async function checkNetworkStatus(): Promise<void> {
  loggerCronJobs.info("Checking network status");
  await networkUseCases.getNetworkStatus();
  loggerCronJobs.info("Finished checking network status");
}

const cronCheckNetworkStatus = new CronWorker("CHECK_NETWORK", checkNetworkStatus, 2.5);

export default cronCheckNetworkStatus;
