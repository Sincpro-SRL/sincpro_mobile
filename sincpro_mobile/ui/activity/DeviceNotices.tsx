import { textOf } from "@sincpro/mobile/domain/events/label";
import { useCommon } from "@sincpro/mobile/entrypoints/ui/common_provider";
import type { ActivityFact } from "@sincpro/mobile/infrastructure/ui/activity";
import { Toast, useToast } from "@sincpro/mobile-ui/Feedback";
import { useEffect, useRef } from "react";
import { View } from "react-native";

import { useActivity } from "./useActivity";

const VARIANT = {
  success: "success",
  danger: "danger",
  info: "info",
  warning: "warning",
} as const;

type Toasts = ReturnType<typeof useToast>;

/**
 * One notice as a toast:
 * 1. Without actions, or without a host that handles them, a plain toast.
 * 2. With one action, the toast's own button.
 * 3. With more (a failed print: "Ver fallidas" and "Impresora"), a composed toast with a
 *    button per action. Each button closes the toast and calls `onAction(intent)`.
 */
function showNotice(
  toast: Toasts,
  notice: ActivityFact,
  locale: string | null,
  onAction?: (intent: string) => void,
) {
  const title = textOf(notice.label, locale);
  const message = textOf(notice.detail ?? notice.label, locale);
  const variant = VARIANT[notice.variant ?? "info"];
  const actions = onAction ? (notice.actions ?? []) : [];

  if (actions.length < 2) {
    const [only] = actions;
    toast.show({
      title,
      message,
      variant,
      action:
        only && onAction
          ? { label: only.label, onPress: () => onAction(only.intent) }
          : undefined,
    });
    return;
  }

  toast.show({
    variant,
    render: ({ dismiss }) => (
      <Toast.Root>
        <Toast.Icon variant={variant} />
        <Toast.Content>
          <Toast.Title>{title}</Toast.Title>
          <Toast.Description>{message}</Toast.Description>
          <View className="flex-row flex-wrap gap-2 mt-2">
            {actions.map((action) => (
              <Toast.Action
                key={action.intent}
                label={action.label}
                onPress={() => {
                  dismiss();
                  onAction?.(action.intent);
                }}
              />
            ))}
          </View>
        </Toast.Content>
        <Toast.Close onPress={dismiss} />
      </Toast.Root>
    ),
  });
}

/** Shows device notices as toasts; a notice's buttons call `onAction(intent)`. */
export function DeviceNotices({ onAction }: { onAction?: (intent: string) => void }) {
  const { notices } = useActivity();
  const { locale } = useCommon();
  const toast = useToast();
  const shownRef = useRef(new Set<string>());

  useEffect(() => {
    for (const notice of notices) {
      if (shownRef.current.has(notice.id)) continue;
      shownRef.current.add(notice.id);
      showNotice(toast, notice, locale, onAction);
    }
  }, [locale, notices, onAction, toast]);

  return null;
}
