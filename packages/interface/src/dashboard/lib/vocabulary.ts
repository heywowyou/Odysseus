/** Lookup with raw-code fallback: operator tables show the localized
 *  label for a closed vocabulary value, or the code itself when the
 *  value is unknown to the map (a newer store value must still render
 *  rather than disappear). */
export function vocabularyLabel(
  map: Record<string, string>,
  value: string | null | undefined,
): string {
  if (value === null || value === undefined || value === '') return '';
  return map[value] ?? value;
}
