import type { Criteria, Expression } from "@sincpro/criteria";
import type { EventRecord } from "@sincpro/mobile/domain/events";
import {
  type CriteriaCondition,
  type CriteriaField,
  type CriteriaGroup,
  type CriteriaNode,
} from "@sincpro/mobile-ui/utils/criteria";

/** The stored queue's states, and all of them. */
export type EventStatusFilter = "ALL" | "pending" | "delivered" | "set_aside";

export type EventDateRange = "all" | "today" | "week" | "month";

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
    id: "state",
    label: "Estado",
    type: "choice",
    options: [
      { label: "Pendiente", value: "pending" },
      { label: "Entregado", value: "delivered" },
      { label: "Fallido", value: "set_aside" },
    ],
    operators: [{ id: "equal", label: "es", arity: "one" }],
  },
  {
    id: "publishedAt",
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

type EventExpression = Expression<EventRecord>;

/** The local day `day` (`YYYY-MM-DD`) starts at, as the instant `publishedAt` is compared to. */
function dayStart(day: string, days = 0): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date + days).toISOString();
}

function startOfToday(now: Date, daysBack: number): string {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack).toISOString();
}

function rangeOf(range: EventDateRange, now: Date): EventExpression | undefined {
  if (range === "all") return undefined;
  const back = range === "today" ? 0 : range === "week" ? 6 : 29;
  return { field: "publishedAt", operator: ">=", value: startOfToday(now, back) };
}

/** A condition on the publishing date, read as local days, as the filter builder shows them. */
function onDay(condition: CriteriaCondition): EventExpression {
  const [first = "", second = ""] = condition.values.map(String);
  if (condition.operator === "before") {
    return { field: "publishedAt", operator: "<", value: dayStart(first) };
  }
  if (condition.operator === "after") {
    return { field: "publishedAt", operator: ">=", value: dayStart(first, 1) };
  }
  const last = condition.operator === "between" ? second : first;
  return {
    all: [
      { field: "publishedAt", operator: ">=", value: dayStart(first) },
      { field: "publishedAt", operator: "<", value: dayStart(last, 1) },
    ],
  };
}

function conditionOf(condition: CriteriaCondition): EventExpression {
  if (condition.field === "publishedAt") return onDay(condition);
  const field = condition.field as keyof EventRecord & string;
  const [first, second] = condition.values;
  const numeric = field === "attempts";
  const value = numeric ? Number(first) : String(first ?? "");
  switch (condition.operator) {
    case "contains":
      return { field, operator: "like", value: String(first ?? "") };
    case "empty":
      return {
        any: [
          { field, operator: "is null", value: true },
          { field, operator: "=", value: "" },
        ],
      };
    case "greater":
      return { field, operator: ">", value };
    case "between":
      return { field, operator: "between", value: [Number(first), Number(second)] };
    default:
      return { field, operator: "=", value };
  }
}

function expressionOf(node: CriteriaNode): EventExpression | undefined {
  if (node.kind === "condition") return conditionOf(node);
  const parts = node.children
    .map(expressionOf)
    .filter((part): part is EventExpression => part !== undefined);
  if (parts.length === 0) return undefined;
  if (node.join === "any") return { any: parts };
  if (node.join === "none") return { negate: { any: parts } };
  return { all: parts };
}

/**
 * What the event screens ask the stored events: the state chosen, the text typed (its label or
 * its technical name), the days and the custom filter, all at once — read in SQL a page at a
 * time (`CommandSearchEvents`), never filtered over what is already on screen.
 */
export function eventCriteria(
  filters: {
    status?: EventStatusFilter;
    query?: string;
    range?: EventDateRange;
    custom?: CriteriaGroup;
  },
  now = new Date(),
): Criteria<EventRecord> {
  const typed = (filters.query ?? "").trim();
  const parts = [
    filters.status && filters.status !== "ALL"
      ? ({ field: "state", operator: "=", value: filters.status } as EventExpression)
      : undefined,
    typed
      ? ({
          any: [
            { field: "label", operator: "like", value: typed },
            { field: "name", operator: "like", value: typed },
          ],
        } as EventExpression)
      : undefined,
    rangeOf(filters.range ?? "all", now),
    filters.custom ? expressionOf(filters.custom) : undefined,
  ].filter((part): part is EventExpression => part !== undefined);
  if (parts.length === 0) return {};
  return { selection: parts.length === 1 ? parts[0] : { all: parts } };
}
