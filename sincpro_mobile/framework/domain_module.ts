import type { CommandType, HearingContext } from "@sincpro/client-framework";
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
   * The bounded contexts of this module (`xBoundedContext`). While its domain is active, the
   * queue's one `Subscriber` delivers to them: an event reaches each use case registered for it
   * (`@x.feature([CommandX, Event])`) and each event handler of theirs
   * (`@x.handler([EventA, EventB])`, in the module's `entrypoints/queue/`). Around their use cases
   * goes `boundedContext.interceptor(...)`; a module replaces a core use case with
   * `commonBoundedContext.feature(dto, { replaces })`.
   */
  boundedContexts(): readonly HearingContext[] {
    return [];
  }

  /**
   * The Commands its bounded contexts take from the queue — a message whose `type` is the
   * Command's identity. None unless named, as the backend's `@queue.consumes`: a bus never
   * hands every Command to whoever can put a message on a queue.
   */
  consumes(): readonly CommandType[] {
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
