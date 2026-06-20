import { safeJsonStringify } from "@sincpro/mobile-ui/lib/serializer";
import { ListViewV2 } from "@sincpro/mobile-ui/views/ListViewV2";
import { EVariantScreenHeader } from "@sincpro/mobile-ui/widgets/ScreenHeader";

import TableInfoRow from "../../components/organisms/TableInfoInfoRow";
import { useDatabase } from "./database.context";

function TableRowsView() {
  const {
    isLoading,
    filteredData,
    selectedTable,
    goBackFromRows,
    selectRowJson,
    setSearchQuery,
  } = useDatabase();

  return (
    <ListViewV2.Root
      isLoading={isLoading}
      items={filteredData}
      name={`Datos - ${selectedTable}`}
      onBack={goBackFromRows}
      onPressItem={(item: any) => selectRowJson(safeJsonStringify(item), item.index)}
      onSearch={setSearchQuery}
    >
      <ListViewV2.Header variant={EVariantScreenHeader.FLAT_HEADER}>
        <ListViewV2.Header.Search />
      </ListViewV2.Header>

      <ListViewV2.Content>
        {(item: any) => (
          <TableInfoRow
            item={{ data: safeJsonStringify(item) }}
            onPress={() => selectRowJson(safeJsonStringify(item), item.index)}
          />
        )}
      </ListViewV2.Content>
    </ListViewV2.Root>
  );
}

export default TableRowsView;
