import { DatabaseTableRepository } from "../../adapters/repositories/database_table.repository";
import { DomainEventRepository } from "../../adapters/repositories/domain_event.repository";
import { DomainEventDeadLetterRepository } from "../../adapters/repositories/domain_event_dead_letter.repository";
import { SettingsRepository } from "../../adapters/repositories/setting.repository";
import type { IMigration } from "../../domain/database";
import { ECommonRepository } from "../../domain/repository";
import type { Subscriber } from "../../domain/subscriber";
import type { CronWorker } from "../../infrastructure/workers";
import cronCheckNetworkStatus from "../cron/checkNetworkStatus.cron";
import MIGRATIONS from "../db/migrations";
import { ActivateDomainSubscriber } from "../queue/activateDomain.subscriber";
import { NewAppSettingsSubscriber } from "../queue/newAppSettings.handler";
import { PrintImageSubscriber } from "../queue/printImage.subscriber";
import { ProcessWebViewMessageSubscriber } from "../queue/processWebViewMessage.subscriber";
import { DomainModule } from "./domain_module";

export class BaseModule extends DomainModule {
  readonly key = "COMMON";
  readonly name = "Common";
  override readonly shared = true;

  override repositories(): Record<string, object> {
    return {
      [ECommonRepository.DATABASE_TABLE]: DatabaseTableRepository,
      [ECommonRepository.DOMAIN_EVENT]: DomainEventRepository,
      [ECommonRepository.DOMAIN_EVENT_DEAD_LETTER]: DomainEventDeadLetterRepository,
      [ECommonRepository.SETTINGS]: SettingsRepository,
    };
  }

  override migrations(): IMigration[] {
    return MIGRATIONS;
  }

  override subscribers(): Subscriber[] {
    return [
      new ActivateDomainSubscriber(),
      new ProcessWebViewMessageSubscriber(),
      new PrintImageSubscriber(),
      new NewAppSettingsSubscriber(),
    ];
  }

  override crons(): CronWorker[] {
    return [cronCheckNetworkStatus];
  }
}

export const baseModule = new BaseModule();
