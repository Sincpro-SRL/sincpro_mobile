import { DomainEvent, EEventStatus } from "@sincpro/mobile/domain/event";
import { Display } from "@sincpro/mobile-ui/Display";
import { Form } from "@sincpro/mobile-ui/Form";
import { Typography } from "@sincpro/mobile-ui/Typography";
import JsonPreview from "@sincpro/mobile-ui/widgets/JSONViewer";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { View } from "react-native";

interface EventRowProps {
  item: DomainEvent;
  onRetry: (event: DomainEvent) => Promise<void> | void;
}

function EventRow({ item, onRetry }: EventRowProps) {
  const [showPayload, setShowPayload] = useState(false);
  const [sending, setSending] = useState(false);

  if (!item) return null;

  const payloadString = item.asJSON(true);
  const friendlyName = item.label || item.name;

  const statusBadge = (() => {
    if (item.status === EEventStatus.FAILED) {
      return {
        backgroundClass: "bg-red-100 border-red-200",
        textClass: "text-red-700",
        label: "FAILED",
      };
    }
    if (item.status === EEventStatus.ACKNOWLEDGED) {
      return {
        backgroundClass: "bg-green-100 border-green-200",
        textClass: "text-green-700",
        label: "ACKNOWLEDGED",
      };
    }
    if (item.status === EEventStatus.PENDING || item.status === EEventStatus.PROCESSING) {
      return {
        backgroundClass: "bg-blue-100 border-blue-200",
        textClass: "text-blue-700",
        label: item.status,
      };
    }
    return {
      backgroundClass: "bg-gray-100 border-gray-200",
      textClass: "text-gray-700",
      label: item.status,
    };
  })();

  const handleRetry = async () => {
    if (sending) return;
    setSending(true);
    try {
      await onRetry(item);
    } finally {
      setTimeout(() => setSending(false), 1200);
    }
  };

  function renderMeta() {
    return (
      <View className="flex-row items-center justify-between mb-3">
        <Display.Date
          className="text-gray-800"
          showTime
          textVariant="bodySmall"
          value={item.createdAt}
        />
        <Display.CopyableText label="Copiar UUID" value={item.uuid} />
      </View>
    );
  }

  function renderBadges() {
    const badges: React.ReactElement[] = [];

    const statusVariantMap: Record<
      string,
      "danger" | "success" | "successDark" | "info" | "infoDark" | "warning"
    > = {
      "bg-red-100 border-red-200": "danger",
      "bg-green-100 border-green-200": "successDark",
      "bg-blue-100 border-blue-200": "infoDark",
      "bg-gray-100 border-gray-200": "warning",
    };

    const variant = statusVariantMap[statusBadge.backgroundClass] || "info";

    badges.push(
      <Display.Badge
        className="self-end"
        key="status"
        label={statusBadge.label}
        variant={variant}
      />,
    );

    if (item.requiresNetwork) {
      badges.push(
        <Display.Badge className="self-end" key="network" label="Internet" variant="info" />,
      );
    }

    if (typeof item.sequence === "number" && item.sequence > 0) {
      badges.push(
        <Display.Badge
          className="self-end"
          key="seq"
          label={`#${item.sequence}`}
          variant="infoDark"
        />,
      );
    }

    return <View className="flex-col items-end gap-1.5">{badges}</View>;
  }

  function renderPayload() {
    if (!showPayload) {
      return null;
    }

    return (
      <View className="bg-gray-50 rounded-lg p-2 border border-gray-200 mb-2">
        <Typography.Text className="text-gray-700 mb-1" semibold variant="bodySmall">
          {"Payload"}
        </Typography.Text>
        <JsonPreview selectedJson={payloadString} />
      </View>
    );
  }

  function renderActions() {
    return (
      <View className="mt-2 gap-2">
        <Form.Button
          className="w-full"
          onPress={() => setShowPayload((v) => !v)}
          size="small"
          title={showPayload ? "Ocultar payload" : "Ver payload"}
          variant="secondary"
        />
        <Form.Button
          className="w-full"
          onPress={async () => {
            await Clipboard.setStringAsync(payloadString);
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
          title={sending ? "Reenviando…" : "Re-disparar"}
          variant="primary"
        />
      </View>
    );
  }

  return (
    <View className="bg-white border border-gray-200 rounded-2xl mx-4 p-3.5 mb-3 shadow-sm">
      <View className="flex-row items-start mb-2">
        <View className="flex-1 pr-2">
          <Typography.Text className="mb-1" numberOfLines={2} semibold variant="body">
            {friendlyName}
          </Typography.Text>
          <Display.CopyableText value={item.name} />
        </View>
        <View className="ml-2 self-start">{renderBadges()}</View>
      </View>

      {renderMeta()}
      {renderPayload()}
      {renderActions()}
    </View>
  );
}

export default EventRow;
