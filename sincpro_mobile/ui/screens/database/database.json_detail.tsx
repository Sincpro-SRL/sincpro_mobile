import { Display } from "@sincpro/mobile-ui/Display";
import { Form } from "@sincpro/mobile-ui/Form";
import { theme } from "@sincpro/mobile-ui/theme";
import { Typography } from "@sincpro/mobile-ui/Typography";
import { FormViewV2 } from "@sincpro/mobile-ui/views/FormViewV2";
import JsonPreview from "@sincpro/mobile-ui/widgets/JSONViewer";
import { EVariantScreenHeader } from "@sincpro/mobile-ui/widgets/ScreenHeader";
import * as Clipboard from "expo-clipboard";
import { View } from "react-native";

import { useDatabase } from "./database.context";

const Button = Form.Button;
const Icon = Display.Icon;

function JsonDetailView() {
  const {
    selectedTable,
    selectedRowJson,
    goBackFromJson,
    currentRowIndex,
    filteredData,
    hasNextRow,
    hasPreviousRow,
    goToNextRow,
    goToPreviousRow,
  } = useDatabase();

  return (
    <FormViewV2.Root
      description={`JSON VIEWER - ${selectedTable}`}
      isLoading={false}
      item={{ json: selectedRowJson }}
      name="Detalles"
      onBack={goBackFromJson}
    >
      <FormViewV2.Header variant={EVariantScreenHeader.FLAT_HEADER}>
        <FormViewV2.Header.Actions>
          <Typography.Text className="text-gray-500" variant="bodySmall">
            {currentRowIndex + 1} de {filteredData.length}
          </Typography.Text>
        </FormViewV2.Header.Actions>
      </FormViewV2.Header>

      <FormViewV2.Content>
        <JsonPreview selectedJson={selectedRowJson} />
      </FormViewV2.Content>

      <FormViewV2.Footer>
        <View className="flex-row items-center justify-between gap-3">
          <Button
            className="flex-none min-w-[50px]"
            disabled={!hasPreviousRow}
            icon={
              <Icon
                color={hasPreviousRow ? theme.secondary : theme.text.tertiary}
                name="chevron-left"
                size={24}
                type="feather"
              />
            }
            onPress={goToPreviousRow}
            title={""}
            variant="secondary"
          />

          <Button
            className="flex-1"
            onPress={async () => {
              await Clipboard.setStringAsync(selectedRowJson);
            }}
            title={"Copiar JSON"}
            variant="primary"
          />

          <Button
            className="flex-none min-w-[50px]"
            disabled={!hasNextRow}
            icon={
              <Icon
                color={hasNextRow ? theme.secondary : theme.text.tertiary}
                name="chevron-right"
                size={24}
                type="feather"
              />
            }
            onPress={goToNextRow}
            title={""}
            variant="secondary"
          />
        </View>
      </FormViewV2.Footer>
    </FormViewV2.Root>
  );
}

export default JsonDetailView;
