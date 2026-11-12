import { type Page, resource } from "@sincpro/criteria";
import { useReading } from "@sincpro/criteria-react";
import {
  CommandListTables,
  CommandReadTable,
  commonBoundedContext,
} from "@sincpro/mobile/services";
import { withCleanup } from "@sincpro/mobile/tools/utils/async";
import { safeJsonStringify } from "@sincpro/mobile/tools/utils/serializer";
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useDeferredValue,
  useMemo,
  useState,
} from "react";

export enum EDatabaseView {
  TABLES_LIST = "TABLES_LIST",
  TABLE_ROWS = "TABLE_ROWS",
  JSON_DETAIL = "JSON_DETAIL",
}

type TableRow = Record<string, unknown>;

/** Rows a page: a table is read a page at a time, the next one with its cursor. */
const PAGE_SIZE = 50;

const NO_ROWS: Page<TableRow> = {
  rows: [],
  cursor: null,
  count: null,
  meta: null,
  dropped: [],
};

interface IDatabaseContext {
  currentView: EDatabaseView;
  tables: any[];
  /** The rows read so far of the table, as the person searched it. */
  rows: TableRow[];
  /** How many rows match in all, when counted. */
  total: number | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
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
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [selectedRowJson, setSelectedRowJson] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const searched = useDeferredValue(searchQuery);
  const [currentRowIndex, setCurrentRowIndex] = useState<number>(0);
  const [previousSearchQuery, setPreviousSearchQuery] = useState<string>("");
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);

  const tableRows = useMemo(
    () =>
      resource<TableRow>((criteria) =>
        selectedTable
          ? commonBoundedContext.execute(
              new CommandReadTable(selectedTable, criteria, searched),
            )
          : NO_ROWS,
      ),
    [selectedTable, searched],
  );
  const reading = useReading(tableRows, { pagination: { limit: PAGE_SIZE } });
  const rows = reading.rows;
  const isLoading = isLoadingTables || reading.status === "loading";

  const loadTables = useCallback(async () => {
    setIsLoadingTables(true);
    return withCleanup(
      async () => {
        const result = await commonBoundedContext.execute(new CommandListTables());
        setTables(result);
      },
      () => setIsLoadingTables(false),
    );
  }, []);

  const selectTable = useCallback(async (tableName: string) => {
    setSelectedTable(tableName);
    setCurrentView(EDatabaseView.TABLE_ROWS);
  }, []);

  const goBackFromRows = useCallback(() => {
    setSelectedTable("");
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

    if (currentRowIndex < rows.length - 1) {
      setIsTransitioning(true);
      const newIndex = currentRowIndex + 1;
      setCurrentRowIndex(newIndex);
      const nextRow = rows[newIndex];
      setSelectedRowJson(safeJsonStringify(nextRow));

      setTimeout(() => {
        setIsTransitioning(false);
      }, 300);
    }
  }, [currentRowIndex, rows, isTransitioning]);

  const goToPreviousRow = useCallback(() => {
    if (isTransitioning) return; // Protección contra clics rápidos

    if (currentRowIndex > 0) {
      setIsTransitioning(true);
      const newIndex = currentRowIndex - 1;
      setCurrentRowIndex(newIndex);
      const prevRow = rows[newIndex];
      setSelectedRowJson(safeJsonStringify(prevRow));

      setTimeout(() => {
        setIsTransitioning(false);
      }, 300);
    }
  }, [currentRowIndex, rows, isTransitioning]);

  const hasNextRow = currentRowIndex < rows.length - 1;
  const hasPreviousRow = currentRowIndex > 0;

  if (currentView === EDatabaseView.JSON_DETAIL && searchQuery !== previousSearchQuery) {
    setPreviousSearchQuery(searchQuery);
    goBackFromJson();
  }

  const value = useMemo(
    () => ({
      currentView,
      tables,
      rows,
      total: reading.count?.value ?? null,
      hasMore: reading.hasMore,
      loadMore: reading.more,
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
      rows,
      reading,
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
