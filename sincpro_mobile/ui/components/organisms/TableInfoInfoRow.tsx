import { safeJsonParse, safeJsonStringify } from "@sincpro/mobile/tools/utils/serializer";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { TouchableOpacity, View } from "react-native";

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
    messageId += `[${parsedData.uuid})]`;
  }

  const jsonString = safeJsonStringify(parsedData);

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      className="bg-bg-card p-4 rounded-xl my-2 shadow-sm"
      onPress={onPress}
    >
      <View>
        <Typography.Text className="mb-2" variant="caption">
          {parsedData.name || "Sin Nombre"}
        </Typography.Text>
        <Typography.Text numberOfLines={1} semibold variant="body">
          {messageId || "Sin Identificador"}
        </Typography.Text>

        {parsedData.status && (
          <Typography.Text variant="label">Estado: {parsedData.status}</Typography.Text>
        )}

        <Typography.Text
          className="text-text-secondary"
          ellipsizeMode="tail"
          numberOfLines={2}
          variant="bodySmall"
        >
          {jsonString}
        </Typography.Text>
      </View>
    </TouchableOpacity>
  );
}

export default TableInfoRow;
