import { Decimal } from "@sincpro/client-framework";

export function parseToMonetaryNumber(input?: string | number | null): number {
  if (input == null) return 0;
  const s = String(input).trim();
  if (!/[0-9]/.test(s)) return 0;

  const cleaned = s.replace(/[^0-9.-]+/g, "");
  try {
    return Number(new Decimal(cleaned).toString());
  } catch {
    return 0;
  }
}

export function formatTwoDecimals(value?: number | string | null): string {
  const rounded = Number(new Decimal(parseToMonetaryNumber(value)).rounded(2).toString());
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rounded);
}

export function calculateDiscountedTotal(total: number, discount: number): number {
  if (discount === 0) {
    return 0;
  }

  try {
    const amount = new Decimal(parseToMonetaryNumber(total))
      .times(discount)
      .dividedBy(100, 8);
    return Number(amount.toString());
  } catch {
    return 0;
  }
}
