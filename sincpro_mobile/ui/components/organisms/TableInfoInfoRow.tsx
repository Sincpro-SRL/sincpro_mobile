import { safeJsonParse, safeJsonStringify } from "@sincpro/mobile/tools/utils/serializer";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { Pressable } from "react-native";

export interface TableRowData {
  data: unknown;
}

interface TableListItemProps {
  item: TableRowData;
  onPress?: () => void;
}

function TableInfoRow({ item, onPress }: TableListItemProps) {
  const parsedData = safeJsonParse(
    typeof item.data === "string" ? item.data : safeJsonStringify(item.data),
  ) || {
    raw: item.data,
  };

  let messageId: string = "";
  if (parsedData && parsedData.remote_id) {
    messageId = `(${parsedData.remote_id}) `;
  }
  if (parsedData.uuid) {
    messageId += `[${parsedData.uuid}]`;
  }

  const jsonString = safeJsonStringify(parsedData);

  return (
    <Pressable
      accessibilityRole="button"
      className="border-b border-border-default bg-bg-card px-4 py-3"
      onPress={onPress}
    >
      <Typography.Text numberOfLines={1} semibold>
        {parsedData.name || "Sin nombre"}
      </Typography.Text>
      <Typography.Text className="text-text-secondary" numberOfLines={1} variant="bodySmall">
        {messageId || "Sin identificador"}
      </Typography.Text>
      {parsedData.status ? (
        <Typography.Text className="text-text-tertiary" variant="caption">
          {String(parsedData.status)}
        </Typography.Text>
      ) : null}
      <Typography.Text
        className="text-text-tertiary"
        ellipsizeMode="tail"
        numberOfLines={2}
        variant="caption"
      >
        {jsonString}
      </Typography.Text>
    </Pressable>
  );
}

export default TableInfoRow;
