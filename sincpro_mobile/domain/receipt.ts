/**
 * Maps data keys to display labels. Use `false` to render value centered without label.
 * Use `"separator"` to render a divider line.
 * Use `{ label: string, renderAs: "table" | "list" | "text" }` for custom rendering.
 * You can also control alignment for unlabeled (false) values with `{ label: false, align: "left" | "center" | "right" }`.
 * When `label` is a string you may also optionally provide `align` (defaults to left in key-value rows, center for unlabeled rows).
 */
export type LabelMap = Record<
  string,
  | string
  | false
  | "separator"
  | {
      label: string | boolean;
      renderAs?: "table" | "list" | "text";
      align?: "left" | "center" | "right";
    }
>;

/**
 * Optional formatters per key for custom value rendering.
 */
export type FormatterMap = Record<string, (value: any) => any>;

export interface ReceiptPrintableResponse {
  data: Record<string, any>;
  labels: LabelMap;
  formatters?: FormatterMap;
  order?: string[];
  strictOrder?: boolean;
  emptyPlaceholder?: string;
}

/**
 * Interface for entities that can be exported as printable receipts.
 * Implemented by SaleOrder, Invoice, and CreditNote.
 */
export interface IReceiptExporter {
  exportReceiptDefinition(userName?: string): ReceiptPrintableResponse;
}
