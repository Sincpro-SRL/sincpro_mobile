import DatabaseInfoRow from "@sincpro/mobile/ui/components/organisms/DatabaseInfoRow";
import { ListViewV2 } from "@sincpro/mobile-ui/views/ListViewV2";
import { useEffect } from "react";

import { DatabaseProvider, EDatabaseView, useDatabase } from "./database.context";
import JsonDetailView from "./database.json_detail";
import TableRowsView from "./database.table_rows";

export interface DatabaseListProps {
  /** Leaves the screen. Without it the header shows no back button. */
  onBack?: () => void;
}

function TablesView({ onBack }: DatabaseListProps) {
  const { loadTables, isLoading, tables, selectTable } = useDatabase();

  useEffect(() => {
    void loadTables();
  }, [loadTables]);

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

function DatabaseListContent({ onBack }: DatabaseListProps) {
  const { currentView } = useDatabase();

  switch (currentView) {
    case EDatabaseView.TABLES_LIST:
      return <TablesView onBack={onBack} />;

    case EDatabaseView.TABLE_ROWS:
      return <TableRowsView />;

    case EDatabaseView.JSON_DETAIL:
      return <JsonDetailView />;

    default:
      return null;
  }
}

export default function DatabaseList({ onBack }: DatabaseListProps) {
  return (
    <DatabaseProvider>
      <DatabaseListContent onBack={onBack} />
    </DatabaseProvider>
  );
}
