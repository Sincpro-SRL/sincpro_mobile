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

export function parseToMonetaryNumber(input?: string | number | null): number {
  return Number(toDecimal(input).toString());
}

export function formatTwoDecimals(value?: number | string | null): string {
  const rounded = Number(toDecimal(value).rounded(2).toString());
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rounded);
}

export function discountOf(total: DecimalLike, discount: DecimalLike): Decimal {
  const rate = toDecimal(discount);
  if (rate.isZero) return new Decimal(0);
  return toDecimal(total).times(rate).dividedBy(100, 8);
}

export function calculateDiscountedTotal(total: number, discount: number): number {
  return Number(discountOf(total, discount).toString());
}
