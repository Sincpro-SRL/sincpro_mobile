import { FormatterMap, LabelMap } from "@sincpro/mobile/domain/receipt";
import React, { useMemo } from "react";
import { Platform, ScrollView, Text, View } from "react-native";

const isPrimitive = (value: any): value is string | number | boolean | null | undefined =>
  value == null || ["string", "number", "boolean"].includes(typeof value);

const isPlainObject = (value: any): value is Record<string, any> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isTableData = (array: any[]): boolean => array.length > 0 && array.every(isPlainObject);

const flattenToStrings = (value: any): string[] => {
  const flatten = (item: any): string[] => {
    if (Array.isArray(item)) return item.flatMap(flatten);
    return [String(item ?? "")];
  };

  return isPrimitive(value) ? [String(value ?? "")] : flatten(value);
};

const extractAllKeys = (objects: Record<string, any>[]): string[] => {
  const keySet = new Set<string>();
  objects.forEach((obj) => Object.keys(obj).forEach((key) => keySet.add(key)));
  return Array.from(keySet);
};

const getDisplayKeys = (
  baseKeys: string[],
  order?: string[],
  strictOrder = false,
): string[] => {
  if (!order?.length) return baseKeys;
  if (strictOrder) return order;
  return [...order, ...baseKeys.filter((key) => !order.includes(key))];
};

const safeStringify = (value: any): string => {
  try {
    return isPrimitive(value) ? String(value) : JSON.stringify(value);
  } catch {
    return "[Complex Object]";
  }
};

const arrayToTableFormat = (array: any[], columnName = "Tipo"): Record<string, any>[] => {
  return array.map((item) => ({
    [columnName]: safeStringify(item),
  }));
};

const calculateIntelligentColumnWidths = (
  rows: Record<string, any>[],
  columns: string[],
): Record<string, number> => {
  if (columns.length === 0) {
    return {};
  }

  const columnMetrics = columns.map((column) => {
    const headerLength = column.length;
    const maxContentLength = Math.max(
      ...rows.map((row) => String(row[column] || "").length),
      0,
    );
    const avgContentLength =
      rows.length > 0
        ? rows.reduce((sum, row) => sum + String(row[column] || "").length, 0) / rows.length
        : 0;

    const isNumeric = rows.every(
      (row) =>
        row[column] == null || !isNaN(Number(String(row[column]).replace(/[,\s]/g, ""))),
    );

    const isShortNumeric = isNumeric && maxContentLength <= 10;

    return {
      column,
      headerLength,
      maxContentLength,
      avgContentLength,
      isNumeric,
      isShortNumeric,
      effectiveLength: Math.max(headerLength, maxContentLength),
    };
  });

  const weightedMetrics = columnMetrics.map((metric) => {
    let weight = metric.effectiveLength;

    if (metric.isShortNumeric) {
      weight *= 0.7;
    } else if (metric.isNumeric) {
      weight *= 0.8;
    } else {
      weight *= 1.2;
    }

    if (metric.maxContentLength > 20) {
      weight *= 1.3;
    }

    return { ...metric, weight };
  });

  const totalWeight = weightedMetrics.reduce((sum, metric) => sum + metric.weight, 0);
  const widths: Record<string, number> = {};

  weightedMetrics.forEach((metric) => {
    const basePercentage = (metric.weight / totalWeight) * 100;

    let finalPercentage = basePercentage;

    if (metric.isShortNumeric) {
      finalPercentage = Math.max(finalPercentage, 12);
    } else {
      finalPercentage = Math.max(finalPercentage, 15);
    }

    finalPercentage = Math.min(finalPercentage, 60);

    widths[metric.column] = finalPercentage;
  });

  const currentTotal = Object.values(widths).reduce((sum, width) => sum + width, 0);
  const normalizationFactor = 100 / currentTotal;

  Object.keys(widths).forEach((column) => {
    widths[column] = Math.round(widths[column] * normalizationFactor);
  });

  return widths;
};

interface ValueRendererProps {
  value: any;
  formatter?: (value: any) => React.ReactNode;
  emptyPlaceholder: string;
  centered?: boolean;
  renderAs?: "table" | "list" | "text";
}

function ValueRenderer({
  value,
  formatter,
  emptyPlaceholder,
  centered = false,
  renderAs,
}: ValueRendererProps) {
  if (formatter) {
    const formatted = formatter(value);
    return React.isValidElement(formatted) ? (
      formatted
    ) : (
      <Text className={centered ? "text-center" : ""}>{String(formatted)}</Text>
    );
  }

  if (Array.isArray(value)) {
    return (
      <ArrayRenderer
        centered={centered}
        emptyPlaceholder={emptyPlaceholder}
        renderAs={renderAs}
        value={value}
      />
    );
  }

  if (renderAs === "text") {
    const displayValue = value == null ? emptyPlaceholder : safeStringify(value);
    return <Text className={centered ? "text-center" : ""}>{displayValue}</Text>;
  }

  const displayValue = value == null ? emptyPlaceholder : safeStringify(value);
  return <Text className={centered ? "text-center" : ""}>{displayValue}</Text>;
}

interface ArrayRendererProps {
  value: any[];
  emptyPlaceholder: string;
  centered?: boolean;
  renderAs?: "table" | "list" | "text";
}

function ArrayRenderer({
  value,
  emptyPlaceholder,
  centered = false,
  renderAs,
}: ArrayRendererProps) {
  if (value.length === 0) {
    return <Text className={centered ? "text-center" : ""}>{emptyPlaceholder}</Text>;
  }

  if (renderAs === "table") {
    const tableData = isTableData(value) ? value : arrayToTableFormat(value, "Tipo");
    return <TableRenderer emptyPlaceholder={emptyPlaceholder} rows={tableData} />;
  }

  if (renderAs === "list") {
    const flatContent = flattenToStrings(value).join(", ") || emptyPlaceholder;
    return <Text className={centered ? "text-center" : ""}>{flatContent}</Text>;
  }

  if (renderAs === "text") {
    const textContent = flattenToStrings(value).join(" ") || emptyPlaceholder;
    return <Text className={centered ? "text-center" : ""}>{textContent}</Text>;
  }

  if (isTableData(value)) {
    return <TableRenderer emptyPlaceholder={emptyPlaceholder} rows={value} />;
  }

  const flatContent = flattenToStrings(value).join(", ") || emptyPlaceholder;
  return <Text className={centered ? "text-center" : ""}>{flatContent}</Text>;
}

interface TableRendererProps {
  rows: Record<string, any>[];
  emptyPlaceholder: string;
}

function TableRenderer({ rows, emptyPlaceholder }: TableRendererProps) {
  const columns = useMemo(() => extractAllKeys(rows), [rows]);

  const columnWidths = useMemo(
    () => calculateIntelligentColumnWidths(rows, columns),
    [rows, columns],
  );

  return (
    <View className="mt-0.5">
      <TableHeader columns={columns} columnWidths={columnWidths} />
      {rows.map((row, index) => (
        <TableRow
          columns={columns}
          columnWidths={columnWidths}
          emptyPlaceholder={emptyPlaceholder}
          key={index}
          row={row}
        />
      ))}
    </View>
  );
}

interface TableHeaderProps {
  columns: string[];
  columnWidths: Record<string, number>;
}

function TableHeader({ columns, columnWidths }: TableHeaderProps) {
  return (
    <View className="flex-row border-t border-b-2 border-black py-0.5">
      {columns.map((column) => (
        <Text
          className="flex-1 px-1 py-0.5 font-bold text-xs"
          key={column}
          numberOfLines={1}
          style={{ width: `${columnWidths[column]}%` }}
        >
          {column}
        </Text>
      ))}
    </View>
  );
}

interface TableRowProps {
  row: Record<string, any>;
  columns: string[];
  emptyPlaceholder: string;
  columnWidths: Record<string, number>;
}

function TableRow({ row, columns, emptyPlaceholder, columnWidths }: TableRowProps) {
  return (
    <View className="flex-row border-b border-black py-0.5">
      {columns.map((column) => {
        const cellValue = row[column] == null ? emptyPlaceholder : safeStringify(row[column]);
        return (
          <Text
            className="flex-1 px-1 py-0.5"
            key={column}
            style={{ width: `${columnWidths[column]}%` }}
          >
            {cellValue}
          </Text>
        );
      })}
    </View>
  );
}

interface ReceiptFieldProps {
  fieldKey: string;
  value: any;
  label?: LabelMap[string];
  formatter?: (value: any) => React.ReactNode;
  emptyPlaceholder: string;
}

function ReceiptField({
  fieldKey,
  value,
  label,
  formatter,
  emptyPlaceholder,
}: ReceiptFieldProps) {
  const labelConfig =
    typeof label === "object" && label !== null && "label" in label ? label : null;
  const displayLabel = labelConfig?.label ?? label;
  const alignOverride = labelConfig?.align;
  const renderAs = labelConfig?.renderAs;

  if (displayLabel === false) {
    const contentClass =
      alignOverride === "left"
        ? "items-start my-0.5"
        : alignOverride === "right"
          ? "items-end my-0.5"
          : "items-center my-0.5";

    return (
      <View className={contentClass}>
        <ValueRenderer
          centered={alignOverride ? alignOverride === "center" : true}
          emptyPlaceholder={emptyPlaceholder}
          formatter={formatter}
          renderAs={renderAs}
          value={value}
        />
      </View>
    );
  }

  const finalLabel = typeof displayLabel === "string" ? displayLabel : fieldKey;
  const isArrayValue = Array.isArray(value);

  const shouldRenderAsTable =
    renderAs === "table" ||
    (renderAs !== "list" && renderAs !== "text" && isArrayValue && isTableData(value));

  if (shouldRenderAsTable) {
    return (
      <View className="mb-2">
        <Text className="font-bold mb-0.5">{finalLabel}:</Text>
        <ValueRenderer
          emptyPlaceholder={emptyPlaceholder}
          formatter={formatter}
          renderAs={renderAs}
          value={value}
        />
      </View>
    );
  }

  if (fieldKey === "numericKey" && typeof value === "string" && value.length > 0) {
    const rawGroups = value.trim().split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const g of rawGroups) {
      const candidate = current ? current + " " + g : g;
      if (candidate.length > 25 && current) {
        lines.push(current);
        current = g;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);

    return (
      <View className="my-1.5">
        <Text className="font-bold">{finalLabel}:</Text>
        <View className="mt-0.5 px-1.5 py-1 bg-bg-hover rounded items-center gap-0.5">
          {lines.map((ln, idx) => (
            <Text
              adjustsFontSizeToFit
              key={idx}
              numberOfLines={1}
              style={{
                fontFamily: Platform.select({
                  ios: "Menlo",
                  android: "monospace",
                  default: undefined,
                }),
                letterSpacing: 1,
                fontSize: 11,
              }}
            >
              {ln}
            </Text>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View className="flex-row justify-between items-start py-0.5">
      <Text className="font-bold">{finalLabel}:</Text>
      <View className="items-end">
        <ValueRenderer
          emptyPlaceholder={emptyPlaceholder}
          formatter={formatter}
          renderAs={renderAs}
          value={value}
        />
      </View>
    </View>
  );
}

interface ReceiptProps {
  data: Record<string, any>;
  labels?: LabelMap;
  order?: string[];
  strictOrder?: boolean;
  formatters?: FormatterMap;
  emptyPlaceholder?: string;
}

function Receipt({
  data,
  labels = {},
  order,
  strictOrder = false,
  formatters = {},
  emptyPlaceholder = "---",
}: ReceiptProps) {
  const displayKeys = useMemo(
    () => getDisplayKeys(Object.keys(data), order, strictOrder),
    [data, order, strictOrder],
  );

  return (
    <ScrollView contentContainerClassName="p-4 gap-0.5">
      {displayKeys.map((key) => {
        if (labels[key] === "separator") {
          return <View className="h-[1px] bg-border-divider my-1" key={key} />;
        }

        return (
          <ReceiptField
            emptyPlaceholder={emptyPlaceholder}
            fieldKey={key}
            formatter={formatters[key]}
            key={key}
            label={labels[key]}
            value={data[key]}
          />
        );
      })}
    </ScrollView>
  );
}

export default Receipt;
