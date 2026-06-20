import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { getLocales } from "expo-localization";

const DEFAULT_TIMEZONE = "America/Costa_Rica";
const DEFAULT_LOCALE = "es-CR";

dayjs.extend(utc);
dayjs.extend(timezone);

interface FormatDateOptions {
  locale?: string | null;
  showTime?: boolean; // Si no se especifica se auto-detecta según si la entrada trae hora
}

/**
 * Formatea una fecha en la zona horaria indicada respetando la granularidad de la entrada.
 *
 * Reglas de detección:
 * 1. Si `input` es un string 'YYYY-MM-DD' (solo fecha) => se interpreta como medianoche (00:00:00)
 *    en la zona horaria destino y se devuelve SOLO la parte de fecha (sin hora).
 * 2. Si `input` incluye componente de tiempo (ISO completo o Date) => se convierte a la zona destino
 *    y se muestra fecha + hora (HH:MM) salvo que se fuerce lo contrario mediante `options.showTime`.
 * 3. Cuando `options.showTime` es `true` o `false` se sobre‑escribe la auto‑detección.
 * 4. Si `timezone` es null/undefined o inválido se retorna la cadena "Error de formateo".
 *
 * Localización:
 * - Usa el primer locale del dispositivo (`expo-localization`) como predeterminado.
 * - Puedes forzar uno diferente con `options.locale` (ej: 'es-CR', 'en-US').
 *
 * Seguridad de zona horaria:
 * - El parse de una fecha sin hora NO se hace en la zona local del dispositivo para luego convertir,
 *   sino directamente en la zona destino para evitar corrimientos de día.
 *
 * Ejemplos:
 * ```ts
 * formatDate('2025-09-02', 'America/Costa_Rica');
 * // => "2 de septiembre de 2025"
 *
 * formatDate('2025-09-02T18:30:00Z', 'America/Costa_Rica');
 * // => "2 de septiembre de 2025, 12:30 p. m." (dependiendo del locale real)
 *
 * formatDate(new Date('2025-09-02T23:15:00Z'), 'Europe/Madrid');
 * // => "3 de septiembre de 2025, 01:15" (cambio de día por zona +02)
 *
 * formatDate('2025-09-02', 'America/Costa_Rica', { showTime: true });
 * // => "2 de septiembre de 2025, 12:00 a. m." (fuerza hora)
 * ```
 *
 * @param input      Fecha (string ISO, 'YYYY-MM-DD' o instancia Date)
 * @param timezone   Zona horaria IANA (ej: 'America/Costa_Rica', 'Asia/Tokyo'). Si es null/undefined usa Costa Rica
 * @param options    Opcional: locale forzado y/o bandera para mostrar hora
 * @returns          Cadena localizada o "Error de formateo" si no se puede procesar
 */
export function formatDate(
  input: string | Date,
  timezone: string | null | undefined,
  options?: FormatDateOptions,
): string {
  // Usar timezone por defecto si no se proporciona
  const effectiveTimezone = timezone || DEFAULT_TIMEZONE;

  const fallbackLocale = DEFAULT_LOCALE.split("-")[0]; // "es" from "es-CR"
  const deviceLocale = getLocales()?.[0]?.languageTag ?? fallbackLocale;
  const usedLocale = options?.locale ?? deviceLocale;

  try {
    const rawStr = typeof input === "string" ? input : input.toISOString();
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(rawStr);

    // Auto-detect showTime si no se pasa explicitamente
    const effectiveShowTime =
      options?.showTime !== undefined
        ? options.showTime
        : !isDateOnly && /T\d{2}:\d{2}/.test(rawStr); // tiene componente hora

    const dateInstance = isDateOnly
      ? dayjs.tz(`${rawStr}T00:00:00`, effectiveTimezone)
      : dayjs.utc(rawStr).tz(effectiveTimezone);
    const dateInZone = dateInstance.toDate();

    const formatOptions: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: effectiveTimezone,
    };

    if (effectiveShowTime) {
      formatOptions.hour = "2-digit";
      formatOptions.minute = "2-digit";
    }

    return new Intl.DateTimeFormat(usedLocale, formatOptions).format(dateInZone);
  } catch (error) {
    console.warn("Error formateando fecha:", error);
    return "Error de formateo";
  }
}

/**
 * Formatea una fecha usando automáticamente el timezone por defecto (Costa Rica).
 * Útil para casos donde no se tiene acceso al timezone del usuario.
 *
 * @param input      Fecha (string ISO, 'YYYY-MM-DD' o instancia Date)
 * @param options    Opcional: locale forzado y/o bandera para mostrar hora
 * @returns          Cadena localizada en timezone de Costa Rica
 */
export function formatDateWithDefaultTimezone(
  input: string | Date,
  options?: FormatDateOptions,
): string {
  return formatDate(input, DEFAULT_TIMEZONE, options);
}

/**
 * Obtiene la fecha actual en formato YYYY-MM-DD en el timezone especificado.
 * Útil para crear fechas de programación que respeten el timezone del usuario.
 *
 * @param timezone Zona horaria IANA. Si es null/undefined usa Costa Rica
 * @returns Fecha actual en formato YYYY-MM-DD en el timezone especificado
 */
export function getCurrentDateInTimezone(timezone?: string | null): string {
  const effectiveTimezone = timezone || DEFAULT_TIMEZONE;
  try {
    return dayjs().tz(effectiveTimezone).format("YYYY-MM-DD");
  } catch (error) {
    console.warn("Error obteniendo fecha actual en timezone:", error);
    return dayjs().format("YYYY-MM-DD"); // Fallback to local
  }
}

/**
 * Obtiene la fecha y hora actual en formato ISO en el timezone especificado.
 * Útil para timestamps que necesiten reflejar el timezone del usuario.
 *
 * @param timezone Zona horaria IANA. Si es null/undefined usa Costa Rica
 * @returns Fecha actual en formato ISO en el timezone especificado
 */
export function getCurrentDateTimeInTimezone(timezone?: string | null): string {
  const effectiveTimezone = timezone || DEFAULT_TIMEZONE;
  try {
    return dayjs().tz(effectiveTimezone).toISOString();
  } catch (error) {
    console.warn("Error obteniendo fecha/hora actual en timezone:", error);
    return dayjs().toISOString(); // Fallback to local
  }
}
