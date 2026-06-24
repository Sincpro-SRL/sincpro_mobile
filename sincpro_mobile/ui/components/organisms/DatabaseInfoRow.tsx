import { Display } from "@sincpro/mobile-ui/Display";
import { ListViewV2 } from "@sincpro/mobile-ui/views/ListViewV2";
import { View } from "react-native";

export interface DatabaseInfoRowData {
  name: string;
  description?: string;
  tableName?: string;
}

interface DatabaseInfoRowProps {
  item: DatabaseInfoRowData;
  onPress?: () => void;
}

function DatabaseInfoRow({ item, onPress }: DatabaseInfoRowProps) {
  return (
    <ListViewV2.Content.Row onPress={onPress}>
      <ListViewV2.Content.Row.Avatar>
        <View className="justify-center items-center p-2 rounded-lg bg-bg-muted">
          <Display.Icon name="database" size={32} type="antdesign" />
        </View>
      </ListViewV2.Content.Row.Avatar>

      <ListViewV2.Content.Row.Content>
        <ListViewV2.Content.Row.Title numberOfLines={2}>
          {item.name}
        </ListViewV2.Content.Row.Title>

        <ListViewV2.Content.Row.Subtitle>
          {item.description || "N/A"}
        </ListViewV2.Content.Row.Subtitle>
      </ListViewV2.Content.Row.Content>
    </ListViewV2.Content.Row>
  );
}

export default DatabaseInfoRow;
