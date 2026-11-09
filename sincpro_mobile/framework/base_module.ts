import { DatabaseTableRepository } from "@sincpro/mobile/adapters/repositories/database_table.repository";
import { DomainEventRepository } from "@sincpro/mobile/adapters/repositories/domain_event.repository";
import { DomainEventDeadLetterRepository } from "@sincpro/mobile/adapters/repositories/domain_event_dead_letter.repository";
import { SettingsRepository } from "@sincpro/mobile/adapters/repositories/setting.repository";
import type { IMigration } from "@sincpro/mobile/domain/database";
import { ECommonRepository } from "@sincpro/mobile/domain/repositories";
import cronCheckNetworkStatus from "@sincpro/mobile/entrypoints/cron/checkNetworkStatus.cron";
import MIGRATIONS, { DATABASE_TABLES } from "@sincpro/mobile/entrypoints/db/migrations";
import { ActivateDomainSubscriber } from "@sincpro/mobile/entrypoints/queue/activateDomain.subscriber";
import { NewAppSettingsSubscriber } from "@sincpro/mobile/entrypoints/queue/newAppSettings.handler";
import { PrintImageSubscriber } from "@sincpro/mobile/entrypoints/queue/printImage.subscriber";
import { ProcessWebViewMessageSubscriber } from "@sincpro/mobile/entrypoints/queue/processWebViewMessage.subscriber";
import type { Subscriber } from "@sincpro/mobile/event_driven";
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

  // Both telemetry tables survive restartDatabase() — data generated during
  // logout must still be delivered; the flush cron runs independently of auth state.
  // Settings belong to the device, not to the session: logging out kept wiping the printer,
  // theme, time zone, debug mode and logger switches.
  override persistOnReset(): string[] {
    return [
      DATABASE_TABLES.TELEMETRY_QUEUE,
      DATABASE_TABLES.SPANS_QUEUE,
      DATABASE_TABLES.SETTINGS,
    ];
  }
}

export const baseModule = new BaseModule();
