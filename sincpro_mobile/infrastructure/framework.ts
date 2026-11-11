import { BoundedContext, servicesWith } from "@sincpro/client-framework";
import {
  BluetoothPermissionDenied,
  PrinterNotSelected,
  PrinterUnavailable,
} from "@sincpro/mobile/exceptions";
import {
  type CommonDependencies,
  registerDependencies,
} from "@sincpro/mobile/infrastructure/dependencies";

/**
 * The core's bounded context and the bases of its use cases — the backend's `framework.py`:
 * a `Feature`, `ApplicationService` or `EventHandler` extending these finds every dependency on
 * `this`, and registers itself with `@commonBoundedContext.feature(...)` / `.handler([...])`.
 *
 * Context: the instance lives here, not in `services/index.ts`, because a service imports it to
 * register itself and ES modules run their imports first.
 */
export const { Feature, ApplicationService, EventHandler } =
  servicesWith<CommonDependencies>();

export const commonBoundedContext = registerDependencies(
  new BoundedContext<CommonDependencies>("common"),
)
  // A printer off, none chosen or Bluetooth not granted is the device answering, not a fault:
  // the run ends `refused` — traced, logged, shown — and nothing is reported.
  .expectErrors(PrinterUnavailable, PrinterNotSelected, BluetoothPermissionDenied);
