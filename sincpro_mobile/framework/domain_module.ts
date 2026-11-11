import type { HearingContext, Subscriptions } from "@sincpro/client-framework";
import type { IMigration } from "@sincpro/mobile/domain/database";
import type { WebViewMessageHandler } from "@sincpro/mobile/infrastructure/webview/message_handlers";
import type { CronWorker } from "@sincpro/mobile/infrastructure/workers";

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
   * The bounded contexts of this module (`xBoundedContext`): their use cases, including those
   * whose input is an event — they hear it while the module's domain is active. Around their use
   * cases goes `boundedContext.interceptor(...)`.
   */
  boundedContexts(): readonly HearingContext[] {
    return [];
  }

  /**
   * The subscriptions of this module (`entrypoints/queue`): the `EventSubscriber`s that hear an
   * event and execute its Command, while the module's domain is active. One replaces a core
   * subscriber on the core's own: `commonSubscriptions.subscribe(Event, { replaces })(...)`.
   */
  subscribers(): readonly Subscriptions[] {
    return [];
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
