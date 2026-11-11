// The core's event handlers register on commonBoundedContext when this loads.
import "@sincpro/mobile/entrypoints/queue";

import type { HearingContext } from "@sincpro/client-framework";
import { DatabaseTableRepository } from "@sincpro/mobile/adapters/repositories/database_table.repository";
import { SettingsRepository } from "@sincpro/mobile/adapters/repositories/setting.repository";
import { eventStore } from "@sincpro/mobile/adapters/repositories/sqlite_event_store";
import type { IMigration } from "@sincpro/mobile/domain/database";
import { hasPrinterDriver } from "@sincpro/mobile/domain/print";
import { ECommonRepository } from "@sincpro/mobile/domain/repositories";
import { EWebViewMessageType, type TWebViewMessage } from "@sincpro/mobile/domain/webview";
import { routePrintMessage } from "@sincpro/mobile/domain/webview/print_cycle";
import cronCheckNetworkStatus from "@sincpro/mobile/entrypoints/cron/checkNetworkStatus.cron";
import MIGRATIONS, { DATABASE_TABLES } from "@sincpro/mobile/entrypoints/db/migrations";
import type {
  WebViewMessage,
  WebViewMessageHandler,
} from "@sincpro/mobile/infrastructure/webview/message_handlers";
import type { CronWorker } from "@sincpro/mobile/infrastructure/workers";
import { commonBoundedContext } from "@sincpro/mobile/services";
import { printerService } from "@sincpro/mobile/services/printer.service";

import { DomainModule } from "./domain_module";

export class BaseModule extends DomainModule {
  readonly key = "COMMON";
  readonly name = "Common";
  override readonly shared = true;

  override repositories(): Record<string, object> {
    return {
      [ECommonRepository.DATABASE_TABLE]: DatabaseTableRepository,
      [ECommonRepository.STORED_EVENTS]: eventStore,
      [ECommonRepository.SETTINGS]: SettingsRepository,
    };
  }

  override migrations(): IMigration[] {
    return MIGRATIONS;
  }

  override boundedContexts(): readonly HearingContext[] {
    return [commonBoundedContext];
  }

  override crons(): CronWorker[] {
    return [cronCheckNetworkStatus];
  }

  /** The print cycle of a page with the print interceptor; an app can replace any type. */
  override webViewHandlers(): Record<string, WebViewMessageHandler> {
    const printCycle = (message: WebViewMessage) =>
      routePrintMessage(message as unknown as TWebViewMessage, {
        started: (title, jobId) => printerService.reportPrintStarted(title, jobId),
        failed: (title, reason, jobId) =>
          printerService.reportPrintFailed(title, reason, jobId),
        image: (input) => printerService.enqueuePrintImage(input),
      }).then(() => undefined);
    return {
      [EWebViewMessageType.PRINT_STARTED]: printCycle,
      [EWebViewMessageType.PRINT_FAILED]: printCycle,
      [EWebViewMessageType.PRINT_IMAGE]: printCycle,
    };
  }

  /** A host that prints keeps its saved printer connected (start, return, lost link). */
  override onStart(): void {
    if (hasPrinterDriver()) printerService.keepConnected();
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
