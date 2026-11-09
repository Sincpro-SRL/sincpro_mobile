import type { IMigration } from "@sincpro/mobile/domain/database";
import type { Subscriber } from "@sincpro/mobile/event_driven";
import type { WebViewMessageHandler } from "@sincpro/mobile/infrastructure/webview/message_handlers";
import type { CronWorker } from "@sincpro/mobile/infrastructure/workers";
import type { EventInterceptor } from "@sincpro/mobile/infrastructure/workers/interceptors";

export abstract class DomainModule {
  abstract readonly key: string;
  abstract readonly name: string;
  readonly shared: boolean = false;

  repositories(): Record<string, object> {
    return {};
  }

  migrations(): IMigration[] {
    return [];
  }

  /**
   * Subscribers of this module. One can answer instead of a core subscriber by declaring
   * `static replaces = CoreSubscriber`: the core one stops running.
   */
  subscribers(): Subscriber[] {
    return [];
  }

  /**
   * Interceptors around the subscribers of an event, by event name (`"*"` for all of them).
   * They change core behavior from the app without modifying the core.
   */
  interceptors(): Record<string, EventInterceptor | EventInterceptor[]> {
    return {};
  }

  /**
   * Handlers of messages posted by pages in a WebView, by message `type`. A module's handler
   * for a type replaces the core one.
   */
  webViewHandlers(): Record<string, WebViewMessageHandler> {
    return {};
  }

  /** The app started in the foreground, with the data layer ready. */
  onStart(): void | Promise<void> {}

  /** The app came back to the foreground. */
  onForeground(): void | Promise<void> {}

  /** A session started or was restored. */
  onLogin(): void | Promise<void> {}

  /** The session ended, before local data is cleaned. */
  onLogout(): void | Promise<void> {}

  crons(): CronWorker[] {
    return [];
  }

  persistOnReset(): string[] {
    return [];
  }
}
