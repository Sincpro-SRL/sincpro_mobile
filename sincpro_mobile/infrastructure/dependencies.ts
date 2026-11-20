import { type BoundedContext, Publisher } from "@sincpro/client-framework";
import {
  type NetworkAdapter,
  networkAdapter,
} from "@sincpro/mobile/adapters/Network.adapter";
import { devicePermissions } from "@sincpro/mobile/adapters/permissions.adapter";
import {
  type PrinterAdapter,
  printerAdapter,
} from "@sincpro/mobile/adapters/Printer.adapter";
import { DatabaseTableRepository } from "@sincpro/mobile/adapters/repositories/database_table.repository";
import { printJobRepository } from "@sincpro/mobile/adapters/repositories/print_job.repository";
import { SettingsRepository } from "@sincpro/mobile/adapters/repositories/setting.repository";
import {
  eventStore,
  type SqliteEventStore,
} from "@sincpro/mobile/adapters/repositories/sqlite_event_store";
import type { Notifier } from "@sincpro/mobile/domain/notifier";
import type { DevicePermissions, PermissionStates } from "@sincpro/mobile/domain/permissions";
import type { PrintJobPrompt, PrintJobStore } from "@sincpro/mobile/domain/print/print_job";
import type { AppSettings } from "@sincpro/mobile/domain/settings";
import { orchestrator } from "@sincpro/mobile/framework/orchestrator";
import { appSettings } from "@sincpro/mobile/infrastructure/app_settings";
import { eventDelivery } from "@sincpro/mobile/infrastructure/events/delivery";
import { permissionStates } from "@sincpro/mobile/infrastructure/permission_states";
import { printJobPrompt } from "@sincpro/mobile/infrastructure/print/print_job_prompt";
import { telemetryDelivery } from "@sincpro/mobile/infrastructure/telemetry/init_telemetry";
import { deviceNotifier } from "@sincpro/mobile/infrastructure/ui/activity";
import { UIEventBus } from "@sincpro/mobile/infrastructure/ui/UIEventBus";
import type { DomainSwitch } from "@sincpro/mobile/services/domains/common";
import type { SettingsStore } from "@sincpro/mobile/services/settings/apply_app_settings.feature";
import type { TelemetryDelivery } from "@sincpro/mobile/services/telemetry/send_error_report.feature";

/** The stored queue as the event use cases need it: deliver what waits. */
export type EventDelivery = { drain(): Promise<void> };

/**
 * What every use case of the core's bounded context finds on `this` — the backend's
 * `dependencies.py`: declared once here, never in a Feature. Each is a port's adapter or a piece
 * of the process; an app puts its own in place of one with
 * `commonBoundedContext.addDependency(name, mine, { replaces: commonBoundedContext.deps[name] })`.
 */
export interface CommonDependencies {
  domains: DomainSwitch;
  settingsStore: SettingsStore;
  /** What the app runs with — time zone, language, colors —: loaded again when a setting is saved. */
  appSettings: AppSettings;
  notifier: Notifier;
  /** Bound to each run: what a use case queues joins its flow and its trace. */
  publisher: Publisher;
  printer: PrinterAdapter;
  /** The prints of more than one page waiting on the device, page by page. */
  printJobs: PrintJobStore;
  /** Where a print job waits for the person: on a phone, the AppShell's sheet. */
  printJobPrompt: PrintJobPrompt;
  /** The phone's permissions: only `CommandRequestPermission` shows the system's dialog. */
  permissions: DevicePermissions;
  /** Each permission's last known status, for the screens (`usePermission`). */
  permissionStates: PermissionStates;
  network: NetworkAdapter;
  /** Where the screens and the queue hear of the connection (`InternetIsUp` / `InternetIsDown`). */
  uiEvents: typeof UIEventBus;
  /** The stored events: what the event screens list, retry and delete. */
  eventStore: SqliteEventStore;
  /** The stored queue: it delivers what a person retried or resent. */
  eventDelivery: EventDelivery;
  databaseTables: typeof DatabaseTableRepository;
  /** The app's log lines and spans, sent now when a person sends a report. */
  telemetry: TelemetryDelivery;
}

/** Supplies each dependency at runtime. */
export function registerDependencies(
  boundedContext: BoundedContext<CommonDependencies>,
): BoundedContext<CommonDependencies> {
  boundedContext.addDependency("domains", orchestrator);
  boundedContext.addDependency("settingsStore", SettingsRepository);
  boundedContext.addDependency("appSettings", appSettings);
  boundedContext.addDependency("notifier", deviceNotifier);
  boundedContext.addDependency("publisher", new Publisher(eventDelivery));
  boundedContext.addDependency("printer", printerAdapter);
  boundedContext.addDependency("printJobs", printJobRepository);
  boundedContext.addDependency("printJobPrompt", printJobPrompt);
  boundedContext.addDependency("permissions", devicePermissions);
  boundedContext.addDependency("permissionStates", permissionStates);
  boundedContext.addDependency("network", networkAdapter);
  boundedContext.addDependency("uiEvents", UIEventBus);
  boundedContext.addDependency("eventStore", eventStore);
  boundedContext.addDependency("eventDelivery", eventDelivery);
  boundedContext.addDependency("databaseTables", DatabaseTableRepository);
  boundedContext.addDependency("telemetry", telemetryDelivery);
  return boundedContext;
}
