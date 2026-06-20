import { DatabaseTableRepository } from "@sincpro/mobile/adapters/repositories/database_table.repository";
import { DomainEventRepository } from "@sincpro/mobile/adapters/repositories/domain_event.repository";
import { DomainEventDeadLetterRepository } from "@sincpro/mobile/adapters/repositories/domain_event_dead_letter.repository";
import { SettingsRepository } from "@sincpro/mobile/adapters/repositories/setting.repository";
import type { IMigration } from "@sincpro/mobile/domain/database";
import { ECommonRepository } from "@sincpro/mobile/domain/repository";
import type { Subscriber } from "@sincpro/mobile/domain/subscriber";
import cronCheckNetworkStatus from "@sincpro/mobile/entrypoints/cron/checkNetworkStatus.cron";
import MIGRATIONS from "@sincpro/mobile/entrypoints/db/migrations";
import { ActivateDomainSubscriber } from "@sincpro/mobile/entrypoints/queue/activateDomain.subscriber";
import { NewAppSettingsSubscriber } from "@sincpro/mobile/entrypoints/queue/newAppSettings.handler";
import { PrintImageSubscriber } from "@sincpro/mobile/entrypoints/queue/printImage.subscriber";
import { ProcessWebViewMessageSubscriber } from "@sincpro/mobile/entrypoints/queue/processWebViewMessage.subscriber";
import type { CronWorker } from "@sincpro/mobile/infrastructure/workers";

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
