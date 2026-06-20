import { Big } from "big.js";

export function parseToMonetaryNumber(input?: string | number | null): number {
  if (input == null) return 0;
  const s = String(input).trim();
  if (!/[0-9]/.test(s)) return 0;

  const cleaned = s.replace(/[^0-9.-]+/g, "");
  try {
    return Number(new Big(cleaned).toString());
  } catch {
    return 0;
  }
}

export function formatTwoDecimals(value?: number | string | null): string {
  const raw = parseToMonetaryNumber(value);
  const rounded = new Big(raw).toFixed(2);
  const num = Number(rounded);
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function calculateDiscountedTotal(total: number, discount: number): number {
  if (discount === 0) {
    return 0;
  }

  const result = (parseToMonetaryNumber(total) * discount) / 100;
  return parseToMonetaryNumber(result);
}
