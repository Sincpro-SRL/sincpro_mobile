export type LabelText = string | Readonly<Record<string, string>>;

export function textOf(label: LabelText | null | undefined, locale?: string | null): string {
  if (typeof label === "string") return label;
  if (!label) return "";

  const table = label as Record<string, string>;
  if (locale) {
    const exact = table[locale];
    if (exact) return exact;
    const language = locale.split("-")[0];
    if (language && language !== locale && table[language]) return table[language];
    if (table.default) return table.default;
  }

  if (table.es) return table.es;
  if (table.default) return table.default;
  for (const value of Object.values(table)) {
    if (value) return value;
  }
  return "";
}
