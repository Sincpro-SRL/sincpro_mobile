import { Decimal, type DecimalLike } from "@sincpro/client-framework";

export function toDecimal(input?: DecimalLike | null): Decimal {
  if (input == null) return new Decimal(0);
  if (typeof input === "number" && !Number.isFinite(input)) return new Decimal(0);
  if (typeof input === "string") {
    const text = input.trim();
    if (!/[0-9]/.test(text)) return new Decimal(0);
    try {
      return new Decimal(text.replace(/[^0-9.-]+/g, ""));
    } catch {
      return new Decimal(0);
    }
  }
  try {
    return new Decimal(input);
  } catch {
    return new Decimal(0);
  }
}

export function parseToMonetaryNumber(input?: DecimalLike | null): Decimal {
  return toDecimal(input);
}

export function formatTwoDecimals(value?: DecimalLike | null): string {
  const text = toDecimal(value).rounded(2).toString();
  const negative = text.startsWith("-");
  const [whole, fraction = "00"] = (negative ? text.slice(1) : text).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${grouped},${fraction}`;
}

export function discountOf(total: DecimalLike, discount: DecimalLike): Decimal {
  const rate = toDecimal(discount);
  if (rate.isZero) return new Decimal(0);
  return toDecimal(total).times(rate).dividedBy(100, 8);
}

export function calculateDiscountedTotal(total: DecimalLike, discount: DecimalLike): Decimal {
  return discountOf(total, discount);
}
