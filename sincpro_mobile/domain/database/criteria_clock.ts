import { timeZoneNow } from "@sincpro/client-framework";
import { InvalidCriteria, type Value } from "@sincpro/criteria";
import { dateTimeFormat } from "@sincpro/mobile/tools/utils/intl";

const UNITS = ["minutes", "hours", "days", "weeks", "months", "years"] as const;
const GRAINS = ["day", "week", "month", "quarter", "year"] as const;

type Unit = (typeof UNITS)[number];
type Grain = (typeof GRAINS)[number];
type Span = Partial<Record<Unit, number>>;

interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

interface Wall extends CalendarDay {
  hour: number;
  minute: number;
  second: number;
  milli: number;
}

export interface CriteriaClock {
  now: Date;
  timeZone: string;
}

/**
 * The clock a criteria is read on: now, in the time zone the app installed
 * (`installTimeZone` of client-framework — a company's, a user's), the platform's when it
 * installed none. `today` and a `period` are cut on that wall clock, not the phone's.
 */
export function deviceClock(now: Date = new Date()): CriteriaClock {
  return { now, timeZone: timeZoneNow() };
}

export function readCriteriaValue(value: Value, clock: CriteriaClock, field = ""): Value {
  if (Array.isArray(value)) {
    return value.map((item) => readCriteriaValue(item, clock, field));
  }
  if (!isDynamic(value) || value.$ === "field") return value;
  if (value.$ === "today") return resolveToday(value, clock);
  if (value.$ === "now") return resolveNow(value, clock);
  if (value.$ === "period") {
    const who = field.length > 0 ? `; '${field}' asked for it so` : "";
    throw new InvalidCriteria(`a period is a range and cannot be one item of a list${who}`);
  }
  if (value.$ === "context" || value.$ === "param") {
    throw new InvalidCriteria("a context or parameter value is not read on the device");
  }
  throw new InvalidCriteria(`'${value.$}' is not read on the device`);
}

function resolveToday(value: DynamicValue, clock: CriteriaClock): string {
  const span = spanOf(value.plus);
  if ((span.hours ?? 0) !== 0 || (span.minutes ?? 0) !== 0) {
    throw new InvalidCriteria("a date has no hours or minutes; use `now` to move by them");
  }
  const moved =
    value.plus === undefined ? zonedDay(clock) : shiftCalendar(zonedDay(clock), span);
  const snapped = snap(moved, grainOf(value.start_of));
  return formatDay(snapped);
}

function resolveNow(value: DynamicValue, clock: CriteriaClock): string {
  const span = spanOf(value.plus);
  const grain = grainOf(value.start_of);
  let utc = clock.now;
  if (value.plus !== undefined) {
    const wall = zonedWall(clock);
    const shifted: Wall = {
      ...shiftCalendar(wall, span),
      hour: wall.hour,
      minute: wall.minute,
      second: wall.second,
      milli: wall.milli,
    };
    const elapsed = ((span.hours ?? 0) * 60 + (span.minutes ?? 0)) * 60_000;
    utc = new Date(wallToUtc(shifted, clock.timeZone).getTime() + elapsed);
  }
  if (grain === undefined) return utc.toISOString();
  const start = snap(zonedWall({ now: utc, timeZone: clock.timeZone }), grain);
  return wallToUtc(
    { ...start, hour: 0, minute: 0, second: 0, milli: 0 },
    clock.timeZone,
  ).toISOString();
}

function zonedDay(clock: CriteriaClock): CalendarDay {
  const wall = zonedWall(clock);
  return { year: wall.year, month: wall.month, day: wall.day };
}

function zonedWall(clock: CriteriaClock): Wall {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = dateTimeFormat("en-US", {
      timeZone: clock.timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(clock.now);
  } catch {
    throw new InvalidCriteria(`unknown timezone '${clock.timeZone}'`);
  }
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((part) => part.type === type)?.value;
    if (found === undefined || !/^\d+$/.test(found)) {
      throw new InvalidCriteria(`unknown timezone '${clock.timeZone}'`);
    }
    return Number(found);
  };
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour") % 24,
    minute: read("minute"),
    second: read("second"),
    milli: clock.now.getUTCMilliseconds(),
  };
}

function shiftCalendar(day: CalendarDay, span: Span): CalendarDay {
  const months = (span.months ?? 0) + (span.years ?? 0) * 12;
  const index = day.year * 12 + day.month - 1 + months;
  const year = Math.floor(index / 12);
  const month = index - year * 12 + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const moved = new Date(
    Date.UTC(
      year,
      month - 1,
      Math.min(day.day, last) + (span.days ?? 0) + 7 * (span.weeks ?? 0),
    ),
  );
  return {
    year: moved.getUTCFullYear(),
    month: moved.getUTCMonth() + 1,
    day: moved.getUTCDate(),
  };
}

function snap(day: CalendarDay, grain: Grain | undefined): CalendarDay {
  if (grain === undefined || grain === "day") return day;
  if (grain === "year") return { year: day.year, month: 1, day: 1 };
  if (grain === "month") return { year: day.year, month: day.month, day: 1 };
  if (grain === "quarter") {
    return {
      year: day.year,
      month: 3 * Math.floor((day.month - 1) / 3) + 1,
      day: 1,
    };
  }
  const utc = new Date(Date.UTC(day.year, day.month - 1, day.day));
  const mondayBased = (utc.getUTCDay() + 6) % 7;
  const start = new Date(utc.getTime() - mondayBased * 86_400_000);
  return {
    year: start.getUTCFullYear(),
    month: start.getUTCMonth() + 1,
    day: start.getUTCDate(),
  };
}

function wallToUtc(wall: Wall, timeZone: string): Date {
  const guess = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  const corrected = guess - zoneOffset(new Date(guess), timeZone);
  const again = guess - zoneOffset(new Date(corrected), timeZone);
  return new Date(again + wall.milli);
}

function zoneOffset(instant: Date, timeZone: string): number {
  const wall = zonedWall({ now: instant, timeZone });
  return (
    Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second) -
    (instant.getTime() - wall.milli)
  );
}

function formatDay(day: CalendarDay): string {
  const month = String(day.month).padStart(2, "0");
  const date = String(day.day).padStart(2, "0");
  return `${day.year}-${month}-${date}`;
}

const PERIOD_NAMES = [
  "today",
  "yesterday",
  "tomorrow",
  "this_week",
  "last_week",
  "next_week",
  "this_month",
  "last_month",
  "next_month",
  "this_quarter",
  "last_quarter",
  "next_quarter",
  "this_year",
  "last_year",
  "next_year",
] as const;

type PeriodName = (typeof PERIOD_NAMES)[number];

const PERIOD_STARTS: Record<PeriodName, [Grain, number]> = {
  today: ["day", 0],
  yesterday: ["day", -1],
  tomorrow: ["day", 1],
  this_week: ["week", 0],
  last_week: ["week", -1],
  next_week: ["week", 1],
  this_month: ["month", 0],
  last_month: ["month", -1],
  next_month: ["month", 1],
  this_quarter: ["quarter", 0],
  last_quarter: ["quarter", -1],
  next_quarter: ["quarter", 1],
  this_year: ["year", 0],
  last_year: ["year", -1],
  next_year: ["year", 1],
};

export function periodBounds(value: Value, clock: CriteriaClock): [string, string] {
  const period = parsePeriod(value);
  const today = zonedDay(clock);
  if (period.kind === "name") {
    const [grain, away] = PERIOD_STARTS[period.name];
    const start = snap(shiftCalendar(today, scale(grainSpan(grain), away)), grain);
    return [formatDay(start), formatDay(shiftCalendar(start, grainSpan(grain)))];
  }
  const current = snap(today, period.unit);
  const step = grainSpan(period.unit);
  const at = (amount: number): CalendarDay => shiftCalendar(current, scale(step, amount));
  if (period.side === "last") {
    return [
      formatDay(at(period.includeCurrent ? -(period.count - 1) : -period.count)),
      formatDay(at(period.includeCurrent ? 1 : 0)),
    ];
  }
  return [
    formatDay(at(period.includeCurrent ? 0 : 1)),
    formatDay(at(period.includeCurrent ? period.count : period.count + 1)),
  ];
}

function grainSpan(grain: Grain): Span {
  if (grain === "day") return { days: 1 };
  if (grain === "week") return { weeks: 1 };
  if (grain === "month") return { months: 1 };
  if (grain === "quarter") return { months: 3 };
  return { years: 1 };
}

function scale(span: Span, amount: number): Span {
  const scaled: Span = {};
  for (const unit of UNITS) {
    const step = span[unit];
    if (step !== undefined) scaled[unit] = step * amount;
  }
  return scaled;
}

function parsePeriod(value: Value): ParsedPeriod {
  if (!isDynamic(value) || value.$ !== "period") {
    throw new InvalidCriteria("a period is a name, or a unit with `last` or `next`");
  }
  const record = value as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!["$", "name", "unit", "last", "next", "include_current"].includes(key)) {
      throw new InvalidCriteria(`'${key}' is not part of a period`);
    }
  }
  const name = record.name;
  const unit = record.unit;
  const last = record.last;
  const next = record.next;
  const include = record.include_current;
  const counted = [last, next].filter((one) => one !== undefined);
  if (name !== undefined) {
    if (typeof name !== "string" || !PERIOD_NAMES.includes(name as PeriodName)) {
      throw new InvalidCriteria(
        `'${String(name)}' is not a period the engine declares; use one of ${PERIOD_NAMES.join(", ")}`,
      );
    }
    if (unit !== undefined || counted.length > 0 || include) {
      throw new InvalidCriteria(
        "a named period takes nothing else; `unit`, `last`, `next` and `include_current` describe a window",
      );
    }
    return { kind: "name", name: name as PeriodName };
  }
  if (grainOf(unit) === undefined || counted.length !== 1) {
    throw new InvalidCriteria(
      'a period is a name, or a unit with `last` or `next`: {"$": "period", "unit": "day", "last": 30}',
    );
  }
  const count = counted[0];
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1) {
    throw new InvalidCriteria(`a period counts at least one unit; got ${String(count)}`);
  }
  if (include !== undefined && typeof include !== "boolean") {
    throw new InvalidCriteria("include_current is true or false");
  }
  return {
    kind: "window",
    unit: unit as Grain,
    side: last === undefined ? "next" : "last",
    count,
    includeCurrent: include === true,
  };
}

type ParsedPeriod =
  | { kind: "name"; name: PeriodName }
  | {
      kind: "window";
      unit: Grain;
      side: "last" | "next";
      count: number;
      includeCurrent: boolean;
    };

function spanOf(plus: unknown): Span {
  if (plus === undefined) return {};
  if (plus === null || typeof plus !== "object" || Array.isArray(plus)) {
    throw new InvalidCriteria("a span names calendar units");
  }
  const record = plus as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!UNITS.includes(key as Unit)) {
      throw new InvalidCriteria(`'${key}' is not a span unit`);
    }
  }
  const span: Span = {};
  for (const unit of UNITS) {
    const amount = record[unit];
    if (amount === undefined) continue;
    if (typeof amount !== "number" || !Number.isInteger(amount)) {
      throw new InvalidCriteria("a span counts whole units");
    }
    span[unit] = amount;
  }
  return span;
}

function grainOf(value: unknown): Grain | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && GRAINS.includes(value as Grain)) return value as Grain;
  throw new InvalidCriteria(`'${String(value)}' is not a calendar grain`);
}

interface DynamicValue {
  $: string;
  plus?: unknown;
  start_of?: unknown;
}

function isDynamic(value: Value): value is Value & DynamicValue {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    "$" in value
  );
}
