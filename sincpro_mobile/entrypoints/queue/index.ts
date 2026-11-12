/**
 * The core's event handlers — the entrypoints the queue delivers its events to: each translates
 * an event into a Command of `commonBoundedContext`. Importing this registers them (their
 * decorators run when their modules load); `services` registers the use cases they execute.
 */
export { OnNewAppSettings } from "@sincpro/mobile/entrypoints/queue/new_app_settings.handler";
export { OnPrintImageRequested } from "@sincpro/mobile/entrypoints/queue/print_image.handler";
