import { useNavigation } from "@react-navigation/native";
import DatabaseInfoRow from "@sincpro/mobile/ui/components/organisms/DatabaseInfoRow";
import { ListViewV2 } from "@sincpro/mobile-ui/views/ListViewV2";
import { useEffect } from "react";

import { DatabaseProvider, EDatabaseView, useDatabase } from "./database.context";
import JsonDetailView from "./database.json_detail";
import TableRowsView from "./database.table_rows";

function TablesView() {
  const navigation = useNavigation();
  const { loadTables, isLoading, tables, selectTable } = useDatabase();

  useEffect(() => {
    void loadTables();
  }, [loadTables]);

  const onBack = () => navigation.goBack();

  return (
    <ListViewV2.Root
      isLoading={isLoading}
      items={tables}
      name="Lista de tablas"
      onBack={onBack}
      onPressItem={async (table: any) => {
        await selectTable(table.name);
      }}
    >
      <ListViewV2.Header variant="default" />

      <ListViewV2.Content>
        {(table: any) => (
          <DatabaseInfoRow
            item={{
              name: table.displayName || table.name,
              description: "Tabla de base de datos",
              tableName: table.name,
            }}
            onPress={async () => {
              await selectTable(table.name);
            }}
          />
        )}
      </ListViewV2.Content>
    </ListViewV2.Root>
  );
}

function DatabaseListContent() {
  const { currentView } = useDatabase();

  switch (currentView) {
    case EDatabaseView.TABLES_LIST:
      return <TablesView />;

    case EDatabaseView.TABLE_ROWS:
      return <TableRowsView />;

    case EDatabaseView.JSON_DETAIL:
      return <JsonDetailView />;

    default:
      return null;
  }
}

export default function DatabaseList() {
  return (
    <DatabaseProvider>
      <DatabaseListContent />
    </DatabaseProvider>
  );
}
