import { DomainEvent } from "@sincpro/mobile/domain/event";
import DeadLetterErrorBlock from "@sincpro/mobile/ui/components/molecules/DeadLetterErrorBlock";
import { Display } from "@sincpro/mobile-ui/Display";
import { Form } from "@sincpro/mobile-ui/Form";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { IRowItemProps } from "@sincpro/mobile-ui/views/types/IListView";
import JsonPreview from "@sincpro/mobile-ui/widgets/JSONViewer";
import * as Clipboard from "expo-clipboard";
import React, { useState } from "react";
import { View } from "react-native";

interface DeadLetterQueueRowProps extends IRowItemProps<DomainEvent> {
  onRetry: (event: DomainEvent) => Promise<void> | void;
}

function getAttemptsBadgeVariant(attempts: number): "warning" | "danger" {
  if (attempts < 3) return "warning";
  return "danger";
}

function DeadLetterQueueRow({ item, onRetry }: DeadLetterQueueRowProps) {
  const [showPayload, setShowPayload] = useState(false);
  const [showError, setShowError] = useState(false);
  const [sending, setSending] = useState(false);

  if (!item || typeof item !== "object") {
    return null;
  }

  const event = item as DomainEvent;

  if (!event.name || !event.createdAt) {
    return null;
  }

  const togglePayload = () => setShowPayload((v) => !v);
  const handleRetry = async () => {
    if (sending) return;
    setSending(true);
    try {
      await onRetry(event);
      setTimeout(() => setSending(false), 5000);
    } catch {
      setSending(false);
    }
  };

  const friendlyName = event.label || event.name;
  const attemptsBadgeVariant = getAttemptsBadgeVariant(event.attempts ?? 0);

  function renderBadges() {
    const badges: React.ReactElement[] = [];

    badges.push(
      <Display.Badge className="self-end" key="status" label="FAILED" variant="danger" />,
    );

    badges.push(
      <Display.Badge
        className="self-end"
        key="attempts"
        label={`${event.attempts} intento${event.attempts !== 1 ? "s" : ""}`}
        variant={attemptsBadgeVariant}
      />,
    );

    if (event.requiresNetwork) {
      badges.push(
        <Display.Badge className="self-end" key="network" label="Internet" variant="info" />,
      );
    }

    if (typeof event.sequence === "number" && event.sequence > 0) {
      badges.push(
        <Display.Badge
          className="self-end"
          key="seq"
          label={`#${event.sequence}`}
          variant="infoDark"
        />,
      );
    }

    return <View className="flex-col items-end gap-1.5">{badges}</View>;
  }

  function renderHeader() {
    return (
      <View className="flex-row items-start mb-2">
        <View className="flex-1 pr-2">
          <Typography.Text className="mb-1" numberOfLines={2} semibold variant="body">
            {friendlyName}
          </Typography.Text>
          <Display.CopyableText value={event.name} />
        </View>
        <View className="ml-2 self-start">{renderBadges()}</View>
      </View>
    );
  }

  function renderMeta() {
    return (
      <View className="flex-row items-center justify-between mb-3">
        <Display.Date
          className="text-gray-800"
          showTime
          textVariant="bodySmall"
          value={event.createdAt}
        />
        <Display.CopyableText label="Copiar UUID" value={event.uuid} />
      </View>
    );
  }

  function renderPayload() {
    if (!showPayload) {
      return null;
    }

    return (
      <View className="bg-gray-50 rounded-lg p-2 border border-gray-200 mb-2.5">
        <Typography.Text className="text-gray-700 mb-1" semibold variant="bodySmall">
          {"Payload"}
        </Typography.Text>
        <JsonPreview selectedJson={event.asJSON(true)} />
      </View>
    );
  }

  function renderActions() {
    return (
      <View className="mt-2 gap-2">
        <Form.Button
          className="w-full"
          onPress={() => setShowError((v) => !v)}
          size="small"
          title={showError ? "Ocultar error" : "Ver error"}
          variant="secondary"
        />
        <Form.Button
          className="w-full"
          onPress={togglePayload}
          size="small"
          title={showPayload ? "Ocultar payload" : "Ver payload"}
          variant="secondary"
        />
        <Form.Button
          className="w-full"
          onPress={async () => {
            await Clipboard.setStringAsync(event.asJSON(true));
          }}
          size="small"
          title="Copiar payload"
          variant="secondary"
        />
        <Form.Button
          className="w-full"
          disabled={sending}
          loading={sending}
          onPress={handleRetry}
          size="medium"
          title={sending ? "Reintentando…" : "Reintentar"}
          variant="primary"
        />
      </View>
    );
  }

  return (
    <View className="bg-white border border-gray-200 rounded-2xl mx-4 p-3.5 mb-3 shadow-sm">
      {renderHeader()}
      {renderMeta()}
      <DeadLetterErrorBlock
        errorMessage={event.errorMessage}
        expanded={showError}
        onToggle={() => setShowError((v) => !v)}
      />
      {renderPayload()}
      {renderActions()}
    </View>
  );
}

export default DeadLetterQueueRow;
