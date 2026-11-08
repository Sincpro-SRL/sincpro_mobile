// Building an Intl formatter resolves locale and time-zone data, which is the slow
// part; format() on an existing one is cheap. Lists format the same few shapes
// over and over, so formatters are shared per locale and options.
const dateFormats = new Map<string, Intl.DateTimeFormat>();

export function dateTimeFormat(
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${locale ?? ""}|${JSON.stringify(options)}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    dateFormats.set(key, format);
  }
  return format;
}
