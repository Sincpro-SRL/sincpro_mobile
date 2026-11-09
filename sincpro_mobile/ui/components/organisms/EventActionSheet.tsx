import { EEventStatus, IntegrationEvent } from "@sincpro/mobile/domain/events";
import { withCleanup } from "@sincpro/mobile/tools/utils/async";
import {
  eventStatusBadge,
  eventStatusLabel,
} from "@sincpro/mobile/ui/components/molecules/event-status";
import { Actions } from "@sincpro/mobile-ui/Actions";
import Sheet from "@sincpro/mobile-ui/Dialog/Sheet";
import type { IconName } from "@sincpro/mobile-ui/Display";
import { Display } from "@sincpro/mobile-ui/Display";
import { Pressable } from "@sincpro/mobile-ui/primitives/Pressable";
import { useTheme } from "@sincpro/mobile-ui/theme";
import { Typography } from "@sincpro/mobile-ui/Typography";
import JsonPreview from "@sincpro/mobile-ui/widgets/JSONViewer";
import * as Clipboard from "expo-clipboard";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { View } from "react-native";

interface EventActionSheetProps {
  event: IntegrationEvent | null;
  visible: boolean;
  onClose: () => void;
  onRetry?: (event: IntegrationEvent) => Promise<unknown> | void;
  retryLabel?: string;
  /** Heading of the sheet; the event's label by default. */
  title?: string;
  /** What the app shows of this event above its details, such as the image of a print. */
  detail?: ReactNode;
  /** Shows the event name and its raw payload; turn it off for people who are not debugging. */
  showTechnical?: boolean;
}

function ActionRow({
  icon,
  label,
  onPress,
  trailing,
  last = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  trailing?: IconName;
  last?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      className={
        last
          ? "flex-row items-center gap-3 px-3"
          : "flex-row items-center gap-3 border-b border-border-light px-3"
      }
      onPress={onPress}
      style={{ minHeight: 48 }}
    >
      <Display.Icon color={theme.icon.secondary} name={icon} size={20} />
      <Typography.Text className="flex-1">{label}</Typography.Text>
      {trailing ? (
        <Display.Icon color={theme.icon.tertiary} name={trailing} size={16} />
      ) : null}
    </Pressable>
  );
}

export function EventActionSheet({
  event,
  visible,
  onClose,
  onRetry,
  retryLabel = "Re-disparar",
  title,
  detail,
  showTechnical = true,
}: EventActionSheetProps) {
  const theme = useTheme();
  const [showPayload, setShowPayload] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  if (!event) return null;

  const later = (run: () => void, ms: number) => {
    timers.current.push(setTimeout(run, ms));
  };
  const attempts = event.attempts ?? 0;
  const failed = event.status === EEventStatus.FAILED;
  const actionLabel = failed ? "Reintentar" : retryLabel;

  const close = () => {
    setShowPayload(false);
    setCopied(false);
    onClose();
  };

  const retry = async () => {
    if (!onRetry || sending) return;
    setSending(true);
    return withCleanup(
      async () => {
        await onRetry(event);
      },
      () => later(() => setSending(false), 1200),
    );
  };

  const copyPayload = () => {
    void Clipboard.setStringAsync(event.asJSON(true));
    setCopied(true);
    later(() => setCopied(false), 1500);
  };

  return (
    <Sheet
      footer={
        onRetry ? (
          <Actions.Button
            disabled={sending}
            icon={
              <Display.Icon
                color={failed ? theme.text.onAccent : theme.text.primary}
                name="sync"
                size={18}
              />
            }
            loading={sending}
            onPress={() => {
              void retry();
            }}
            title={sending ? "Reenviando…" : actionLabel}
            variant={failed ? "cta" : "secondary"}
          />
        ) : undefined
      }
      onClose={close}
      scrollable
      snapPoints={["48%", "88%"]}
      title={title || event.label || event.name}
      visible={visible}
    >
      <View className="gap-3 pb-2">
        {detail}
        <View className="flex-row items-center justify-between gap-3">
          <Display.Badge
            label={eventStatusLabel(event.status)}
            variant={eventStatusBadge(event.status)}
          />
          <Display.Date showTime textVariant="caption" value={event.createdAt} />
        </View>
        {showTechnical ? <Display.CopyableText value={event.name} /> : null}
        <View className="flex-row flex-wrap gap-x-3">
          <Typography.Text className="text-text-tertiary" variant="caption">
            {attempts === 1 ? "1 intento" : `${attempts} intentos`}
          </Typography.Text>
          {event.sequence > 0 ? (
            <Typography.Text className="text-text-tertiary" variant="caption">
              {`Secuencia ${event.sequence}`}
            </Typography.Text>
          ) : null}
          {event.requiresNetwork ? (
            <Typography.Text className="text-text-tertiary" variant="caption">
              Espera red
            </Typography.Text>
          ) : null}
        </View>
        {event.errorMessage ? (
          <Typography.Text className="text-danger" variant="bodySmall">
            {event.errorMessage}
          </Typography.Text>
        ) : null}

        {showTechnical ? (
          <View className="overflow-hidden rounded-xl bg-bg-muted">
            <ActionRow
              icon="document"
              label={showPayload ? "Ocultar payload" : "Ver payload"}
              onPress={() => setShowPayload((value) => !value)}
              trailing={showPayload ? "collapse" : "expand"}
            />
            <ActionRow
              icon={copied ? "success" : "copy"}
              label={copied ? "Copiado" : "Copiar payload"}
              last
              onPress={copyPayload}
            />
          </View>
        ) : null}

        {showTechnical && showPayload ? (
          <View className="rounded-xl bg-bg-muted p-2">
            <JsonPreview selectedJson={event.asJSON(true)} />
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}
