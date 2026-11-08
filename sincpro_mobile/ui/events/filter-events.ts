import {
  type CriteriaField,
  type CriteriaGroup,
  type CriteriaNode,
} from "@sincpro/mobile-ui/utils/criteria";

export type EventStatusFilter =
  | "ALL"
  | "PENDING"
  | "PROCESSING"
  | "FAILED"
  | "ACKNOWLEDGED"
  | "CANCELLED";

export type EventDateRange = "all" | "today" | "week" | "month";

export interface EventListItem {
  name: string;
  label?: string;
  status?: string;
  createdAt: string;
  attempts?: number;
}

export const EVENT_FIELDS: readonly CriteriaField[] = [
  {
    id: "name",
    label: "Nombre técnico",
    type: "text",
    operators: [
      { id: "contains", label: "contiene", arity: "one" },
      { id: "equal", label: "es", arity: "one" },
    ],
  },
  {
    id: "label",
    label: "Nombre",
    type: "text",
    operators: [
      { id: "contains", label: "contiene", arity: "one" },
      { id: "equal", label: "es", arity: "one" },
      { id: "empty", label: "está vacío", arity: "none" },
    ],
  },
  {
    id: "status",
    label: "Estado",
    type: "choice",
    options: [
      { label: "Pendiente", value: "PENDING" },
      { label: "Procesando", value: "PROCESSING" },
      { label: "Fallido", value: "FAILED" },
      { label: "Reconocido", value: "ACKNOWLEDGED" },
      { label: "Cancelado", value: "CANCELLED" },
    ],
    operators: [{ id: "equal", label: "es", arity: "one" }],
  },
  {
    id: "createdAt",
    label: "Fecha",
    type: "date",
    operators: [
      { id: "equal", label: "es", arity: "one" },
      { id: "before", label: "antes de", arity: "one" },
      { id: "after", label: "después de", arity: "one" },
      { id: "between", label: "entre", arity: "range" },
    ],
  },
  {
    id: "attempts",
    label: "Intentos",
    type: "number",
    operators: [
      { id: "equal", label: "es", arity: "one" },
      { id: "greater", label: "mayor que", arity: "one" },
      { id: "between", label: "entre", arity: "range" },
    ],
  },
];

export const emptyCriteria = (): CriteriaGroup => ({
  kind: "group",
  join: "all",
  children: [],
});

export function countConditions(node: CriteriaNode): number {
  if (node.kind === "condition") return 1;
  return node.children.reduce((total, child) => total + countConditions(child), 0);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// Events are immutable in name and label: their normalized text is computed once per
// instance, not once per keystroke. The WeakMap lets collected events go.
const searchText = new WeakMap<EventListItem, readonly [label: string, name: string]>();

function textsOfEvent(event: EventListItem): readonly [string, string] {
  let texts = searchText.get(event);
  if (texts === undefined) {
    texts = [normalize(event.label || ""), normalize(event.name)];
    searchText.set(event, texts);
  }
  return texts;
}

function matchesNeedle(event: EventListItem, needle: string): boolean {
  if (!needle) return true;
  const [label, name] = textsOfEvent(event);
  return label.includes(needle) || name.includes(needle);
}

export function matchesEventQuery(event: EventListItem, query: string): boolean {
  return matchesNeedle(event, normalize(query));
}

export function matchesEventRange(
  createdAt: string,
  range: EventDateRange,
  now = new Date(),
): boolean {
  if (range === "all") return true;
  const time = Date.parse(createdAt);
  if (Number.isNaN(time)) return false;
  const start = startOfDay(now);
  if (range === "today") return time >= start;
  if (range === "week") return time >= start - 6 * DAY_MS;
  return time >= start - 29 * DAY_MS;
}

function localDay(createdAt: string): string {
  const time = Date.parse(createdAt);
  if (Number.isNaN(time)) return "";
  const date = new Date(time);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function fieldValue(event: EventListItem, field: string): string | number {
  if (field === "name") return event.name;
  if (field === "label") return event.label ?? "";
  if (field === "status") return event.status ?? "";
  if (field === "createdAt") return localDay(event.createdAt);
  if (field === "attempts") return event.attempts ?? 0;
  return "";
}

function matchesNode(event: EventListItem, node: CriteriaNode): boolean {
  if (node.kind === "group") {
    if (!node.children.length) return true;
    const results = node.children.map((child) => matchesNode(event, child));
    if (node.join === "any") return results.some(Boolean);
    if (node.join === "none") return !results.some(Boolean);
    return results.every(Boolean);
  }
  const value = fieldValue(event, node.field);
  const first = node.values[0];
  const second = node.values[1];
  if (node.operator === "contains") {
    return normalize(String(value)).includes(normalize(String(first ?? "")));
  }
  if (node.operator === "equal") {
    return typeof value === "number"
      ? value === Number(first)
      : normalize(String(value)) === normalize(String(first ?? ""));
  }
  if (node.operator === "empty") return String(value).trim().length === 0;
  if (node.operator === "greater") return Number(value) > Number(first);
  if (node.operator === "before") return String(value) < String(first ?? "");
  if (node.operator === "after") return String(value) > String(first ?? "");
  if (node.operator === "between") {
    return typeof value === "number"
      ? value >= Number(first) && value <= Number(second)
      : String(value) >= String(first ?? "") && String(value) <= String(second ?? "");
  }
  return false;
}

export function filterEvents<T extends EventListItem>(
  events: readonly T[],
  criteria: {
    status?: EventStatusFilter;
    query?: string;
    range?: EventDateRange;
    custom?: CriteriaGroup;
  },
  now = new Date(),
): T[] {
  const status = criteria.status ?? "ALL";
  const needle = normalize(criteria.query ?? "");
  const range = criteria.range ?? "all";
  const custom = criteria.custom;
  return events.filter((event) => {
    if (status !== "ALL" && event.status !== status) return false;
    if (!matchesNeedle(event, needle)) return false;
    if (!matchesEventRange(event.createdAt, range, now)) return false;
    return custom ? matchesNode(event, custom) : true;
  });
}
