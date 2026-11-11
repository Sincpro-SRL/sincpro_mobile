import { type BoundedContext, Publisher } from "@sincpro/client-framework";
import {
  type BluetoothAdapter,
  bluetoothAdapter,
} from "@sincpro/mobile/adapters/Bluetooth.adapter";
import {
  type NetworkAdapter,
  networkAdapter,
} from "@sincpro/mobile/adapters/Network.adapter";
import {
  type PrinterAdapter,
  printerAdapter,
} from "@sincpro/mobile/adapters/Printer.adapter";
import { DatabaseTableRepository } from "@sincpro/mobile/adapters/repositories/database_table.repository";
import { SettingsRepository } from "@sincpro/mobile/adapters/repositories/setting.repository";
import {
  eventStore,
  type SqliteEventStore,
} from "@sincpro/mobile/adapters/repositories/sqlite_event_store";
import type { Notifier } from "@sincpro/mobile/domain/notifier";
import { orchestrator } from "@sincpro/mobile/framework/orchestrator";
import { eventDelivery } from "@sincpro/mobile/infrastructure/events/delivery";
import { deviceNotifier } from "@sincpro/mobile/infrastructure/ui/activity";
import { UIEventBus } from "@sincpro/mobile/infrastructure/ui/UIEventBus";
import type { DomainSwitch } from "@sincpro/mobile/services/domains/common";
import type { SettingsStore } from "@sincpro/mobile/services/settings/apply_app_settings.feature";

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
  notifier: Notifier;
  /** Bound to each run: what a use case queues joins its flow and its trace. */
  publisher: Publisher;
  printer: PrinterAdapter;
  bluetooth: BluetoothAdapter;
  network: NetworkAdapter;
  /** Where the screens and the queue hear of the connection (`InternetIsUp` / `InternetIsDown`). */
  uiEvents: typeof UIEventBus;
  /** The stored events: what the event screens list, retry and delete. */
  eventStore: SqliteEventStore;
  /** The stored queue: it delivers what a person retried or resent. */
  eventDelivery: EventDelivery;
  databaseTables: typeof DatabaseTableRepository;
}

/** Supplies each dependency at runtime. */
export function registerDependencies(
  boundedContext: BoundedContext<CommonDependencies>,
): BoundedContext<CommonDependencies> {
  boundedContext.addDependency("domains", orchestrator);
  boundedContext.addDependency("settingsStore", SettingsRepository);
  boundedContext.addDependency("notifier", deviceNotifier);
  boundedContext.addDependency("publisher", new Publisher(eventDelivery));
  boundedContext.addDependency("printer", printerAdapter);
  boundedContext.addDependency("bluetooth", bluetoothAdapter);
  boundedContext.addDependency("network", networkAdapter);
  boundedContext.addDependency("uiEvents", UIEventBus);
  boundedContext.addDependency("eventStore", eventStore);
  boundedContext.addDependency("eventDelivery", eventDelivery);
  boundedContext.addDependency("databaseTables", DatabaseTableRepository);
  return boundedContext;
}
