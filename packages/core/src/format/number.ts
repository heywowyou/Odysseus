/**
 * Locale number formatting whose output the report's embedded fonts can print.
 *
 * French ICU groups thousands with a narrow no-break space (U+202F). Neither
 * embedded report face carries that glyph, so Chromium substitutes whatever
 * host font does and the PDF file check rejects the report (trade-off 29).
 * ICU has also changed this separator before, so output that depends on the
 * host's ICU version is not stable. Every grouping or unit space becomes a
 * plain no-break space (U+00A0) instead.
 */

const NARROW_NO_BREAK_SPACE = / /g;
const NO_BREAK_SPACE = ' ';

export function formatLocaleNumber(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options)
    .format(value)
    .replace(NARROW_NO_BREAK_SPACE, NO_BREAK_SPACE);
}
