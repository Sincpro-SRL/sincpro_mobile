import { safeJsonStringify } from "@sincpro/mobile/tools/utils/serializer";
import TableInfoRow from "@sincpro/mobile/ui/components/organisms/TableInfoInfoRow";
import { ListViewV2 } from "@sincpro/mobile-ui/views/ListViewV2";

import { useDatabase } from "./database.context";

function TableRowsView() {
  const {
    isLoading,
    rows,
    hasMore,
    loadMore,
    selectedTable,
    goBackFromRows,
    selectRowJson,
    setSearchQuery,
  } = useDatabase();

  return (
    <ListViewV2.Root
      hasMore={hasMore}
      isLoading={isLoading}
      items={rows}
      name={`Datos - ${selectedTable}`}
      onBack={goBackFromRows}
      onLoadMore={loadMore}
      onPressItem={(item: any) => selectRowJson(safeJsonStringify(item), rows.indexOf(item))}
      onSearch={setSearchQuery}
    >
      <ListViewV2.Header variant="default">
        <ListViewV2.Header.Search />
      </ListViewV2.Header>

      <ListViewV2.Content>
        {(item: any) => (
          <TableInfoRow
            item={{ data: safeJsonStringify(item) }}
            onPress={() => selectRowJson(safeJsonStringify(item), rows.indexOf(item))}
          />
        )}
      </ListViewV2.Content>
    </ListViewV2.Root>
  );
}

export default TableRowsView;
