/** Lookup with raw-code fallback: operator tables show the localized
 *  label for a closed vocabulary value, or the code itself when the
 *  value is unknown to the map (a newer store value must still render
 *  rather than disappear). Callers facing the operator can pass a
 *  localized catch-all label (i18n common.vocabularyFallback) so an
 *  unknown value never puts a pipeline code in front of the operator;
 *  without one, the raw-code fallback is kept. */
export function vocabularyLabel(
  map: Record<string, string>,
  value: string | null | undefined,
  fallbackLabel?: string,
): string {
  if (value === null || value === undefined || value === '') return '';
  return map[value] ?? fallbackLabel ?? value;
}
