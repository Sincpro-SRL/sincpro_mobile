import {
  CommandListTables,
  CommandReadTable,
  commonBoundedContext,
} from "@sincpro/mobile/services";
import { withCleanup } from "@sincpro/mobile/tools/utils/async";
import { safeJsonParse, safeJsonStringify } from "@sincpro/mobile/tools/utils/serializer";
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export enum EDatabaseView {
  TABLES_LIST = "TABLES_LIST",
  TABLE_ROWS = "TABLE_ROWS",
  JSON_DETAIL = "JSON_DETAIL",
}

interface IDatabaseContext {
  currentView: EDatabaseView;
  tables: any[];
  data: any[];
  filteredData: any[];
  isLoading: boolean;
  selectedTable: string;
  selectedRowJson: string;
  searchQuery: string;
  currentRowIndex: number;
  hasNextRow: boolean;
  hasPreviousRow: boolean;
  loadTables: () => Promise<void>;
  selectTable: (tableName: string) => Promise<void>;
  goBackFromRows: () => void;
  selectRowJson: (json: string, index: number) => void;
  goBackFromJson: () => void;
  setSearchQuery: (query: string) => void;
  goToNextRow: () => void;
  goToPreviousRow: () => void;
}

const DatabaseContext = createContext<IDatabaseContext | null>(null);

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [currentView, setCurrentView] = useState<EDatabaseView>(EDatabaseView.TABLES_LIST);
  const [tables, setTables] = useState<any[]>([]);
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [selectedRowJson, setSelectedRowJson] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [currentRowIndex, setCurrentRowIndex] = useState<number>(0);
  const [previousSearchQuery, setPreviousSearchQuery] = useState<string>("");
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);

  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data;
    const query = searchQuery.toLowerCase().trim();
    return data.filter((row) => {
      const parsedData = safeJsonParse(typeof row === "string" ? row : JSON.stringify(row));
      if (!parsedData) return false;
      const remoteId = parsedData.remote_id?.toString().toLowerCase() || "";
      const uuid = parsedData.uuid?.toLowerCase() || "";
      const name = parsedData.name?.toLowerCase() || "";
      return remoteId.includes(query) || uuid.includes(query) || name.includes(query);
    });
  }, [data, searchQuery]);

  const loadTables = useCallback(async () => {
    setIsLoading(true);
    return withCleanup(
      async () => {
        const result = await commonBoundedContext.execute(new CommandListTables());
        setTables(result);
      },
      () => setIsLoading(false),
    );
  }, []);

  const loadTableData = useCallback(async (tableName: string) => {
    setIsLoading(true);
    return withCleanup(
      async () => {
        const dataTable = await commonBoundedContext.execute(new CommandReadTable(tableName));
        setData(dataTable);
      },
      () => setIsLoading(false),
    );
  }, []);

  const selectTable = useCallback(
    async (tableName: string) => {
      setSelectedTable(tableName);
      await loadTableData(tableName);
      setCurrentView(EDatabaseView.TABLE_ROWS);
    },
    [loadTableData],
  );

  const goBackFromRows = useCallback(() => {
    setSelectedTable("");
    setData([]);
    setCurrentRowIndex(0);
    setSearchQuery("");
    setPreviousSearchQuery("");
    setCurrentView(EDatabaseView.TABLES_LIST);
  }, []);

  const selectRowJson = useCallback(
    (json: string, index: number) => {
      if (isTransitioning) {
        console.log("[Database] Ignoring rapid click - transition in progress");
        return;
      }

      setIsTransitioning(true);
      setSelectedRowJson(json);
      setCurrentRowIndex(index);
      setCurrentView(EDatabaseView.JSON_DETAIL);

      setTimeout(() => {
        setIsTransitioning(false);
      }, 300);
    },
    [isTransitioning],
  );

  const goBackFromJson = useCallback(() => {
    setSelectedRowJson("");
    setCurrentView(EDatabaseView.TABLE_ROWS);
  }, []);

  const goToNextRow = useCallback(() => {
    if (isTransitioning) return; // Protección contra clics rápidos

    if (currentRowIndex < filteredData.length - 1) {
      setIsTransitioning(true);
      const newIndex = currentRowIndex + 1;
      setCurrentRowIndex(newIndex);
      const nextRow = filteredData[newIndex];
      setSelectedRowJson(safeJsonStringify(nextRow));

      setTimeout(() => {
        setIsTransitioning(false);
      }, 300);
    }
  }, [currentRowIndex, filteredData, isTransitioning]);

  const goToPreviousRow = useCallback(() => {
    if (isTransitioning) return; // Protección contra clics rápidos

    if (currentRowIndex > 0) {
      setIsTransitioning(true);
      const newIndex = currentRowIndex - 1;
      setCurrentRowIndex(newIndex);
      const prevRow = filteredData[newIndex];
      setSelectedRowJson(safeJsonStringify(prevRow));

      setTimeout(() => {
        setIsTransitioning(false);
      }, 300);
    }
  }, [currentRowIndex, filteredData, isTransitioning]);

  const hasNextRow = currentRowIndex < filteredData.length - 1;
  const hasPreviousRow = currentRowIndex > 0;

  if (currentView === EDatabaseView.JSON_DETAIL && searchQuery !== previousSearchQuery) {
    setPreviousSearchQuery(searchQuery);
    goBackFromJson();
  }

  const value = useMemo(
    () => ({
      currentView,
      tables,
      data,
      filteredData,
      isLoading,
      selectedTable,
      selectedRowJson,
      searchQuery,
      currentRowIndex,
      hasNextRow,
      hasPreviousRow,
      loadTables,
      selectTable,
      goBackFromRows,
      selectRowJson,
      goBackFromJson,
      setSearchQuery,
      goToNextRow,
      goToPreviousRow,
    }),
    [
      currentView,
      tables,
      data,
      filteredData,
      isLoading,
      selectedTable,
      selectedRowJson,
      searchQuery,
      currentRowIndex,
      hasNextRow,
      hasPreviousRow,
      loadTables,
      selectTable,
      goBackFromRows,
      selectRowJson,
      goBackFromJson,
      setSearchQuery,
      goToNextRow,
      goToPreviousRow,
    ],
  );

  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>;
}

export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error("useDatabase must be used within DatabaseProvider");
  }
  return context;
}
