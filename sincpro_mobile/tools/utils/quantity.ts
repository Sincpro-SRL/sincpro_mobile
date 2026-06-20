import { Big } from "big.js";

/** Redondea a la precisión indicada usando round half up */
export function roundTo(value: number, precision: number): number {
  if (isNaN(value)) return 0;
  const factor = new Big(10).pow(precision);
  return Number(new Big(value).times(factor).round(0, 1).div(factor).toString());
}

/** Normaliza la cantidad al múltiplo más cercano del incremento mínimo */
export function normalizeQuantity(
  value: number,
  minIncrement: number,
  precision: number,
): number {
  if (!isFinite(value)) return 0;
  if (value < 0) value = 0;
  if (minIncrement <= 0) return roundTo(value, precision);
  const steps = Math.round(value / minIncrement);
  const normalized = steps * minIncrement;
  return roundTo(normalized, precision);
}

/** Convierte un valor a entero escalado según precisión para cálculos seguros */
export function toScaledInt(value: number, precision: number): number {
  if (!isFinite(value)) return 0;
  const factor = Math.pow(10, precision);
  return Math.round(value * factor);
}

export function fromScaledInt(scaled: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return scaled / factor;
}

/** Multiplicación segura evitando errores binarios típicos */
export function safeMul(a: number, b: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return (Math.round(a * factor) * Math.round(b * factor)) / (factor * factor);
}

/** Valida si un valor es múltiplo del incremento mínimo dentro de la precisión */
export function isMultipleOfIncrement(
  value: number,
  minIncrement: number,
  precision: number,
): boolean {
  if (minIncrement <= 0) return true;
  const scaledValue = toScaledInt(value, precision + 3); // extra precisión para reducir error
  const scaledInc = toScaledInt(minIncrement, precision + 3);
  return scaledValue % scaledInc === 0;
}
