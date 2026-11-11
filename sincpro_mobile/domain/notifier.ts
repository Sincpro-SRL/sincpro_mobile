import type { LabelText } from "@sincpro/mobile/domain/events/label";

/** `loading` is a step of a process: its notice stays until the next one with its key. */
export type NoticeVariant = "success" | "danger" | "info" | "warning" | "loading";

/**
 * A button on a notice. `intent` says where to go ("printer"); the host maps it to a route
 * through `AppShellConfig.onNoticeAction`, so the framework never knows route names.
 */
export interface NoticeAction {
  label: string;
  intent: string;
}

/** What a person is told about a process: notices with the same `key` are one process. */
export type Notice = {
  readonly name: string;
  readonly title: LabelText;
  readonly message: LabelText;
  readonly variant: NoticeVariant;
  readonly actions?: readonly NoticeAction[];
  readonly key?: string;
};

/**
 * How a use case tells the person what happened — the port a Feature holds instead of reaching
 * the UI: on a phone, the device's notices (`deviceNotifier`); in a test, a list.
 */
export interface Notifier {
  notify(notice: Notice): void;
}
