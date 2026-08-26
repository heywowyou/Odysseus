/**
 * A2 (2026-08-24 three-site review): the cover of two real reports
 * printed a company name straight from Sirene's `nom_complet` with no
 * cleanup. La Corniche read "Dénomination sociale : (O! DE LA DUNE" - an
 * opening parenthesis that never closes - and Palais Gallien read
 * "LE PALAIS GALLIEN (LE PALAIS GALLIEN)", the same name twice, because
 * `nom_complet` appends a commercial name in parentheses even when it is
 * identical to the legal one.
 *
 * Deliberately NOT applied to the legal-exposure section. That section
 * states, in its own copy, that the name is "reproduite telle qu'elle
 * figure au répertoire Sirene" - a claim about registry data that must
 * stay byte-exact, per CLAUDE.md rule 6's "state the company's own
 * registry data" posture. The cover carries no such claim and is a
 * presentation surface, so it gets the cleaned form. Two different
 * requirements, deliberately two different values, not an inconsistency
 * to unify later.
 *
 * The cleanup only ever *removes* characters. It never substitutes,
 * reorders, expands an abbreviation, or fixes capitalisation - anything
 * that could make the displayed name differ in substance from the
 * registered one would be inventing a fact about a company.
 */

/** Accent- and case-insensitive comparison key, so "LE PALAIS GALLIEN"
 *  and "Le Palais Gallien" count as the same name for the duplicate
 *  check. Punctuation is kept: "O! DE LA DUNE" and "O DE LA DUNE" are
 *  not confidently the same registered entity. */
function comparisonKey(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase().replace(/\s+/gu, ' ').trim();
}

/** Drops parenthesis characters that have no matching partner, left to
 *  right. A balanced pair anywhere in the name is preserved untouched. */
function dropUnbalancedParentheses(value: string): string {
  const keep = new Array<boolean>(value.length).fill(true);
  const openStack: number[] = [];
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === '(') openStack.push(i);
    else if (value[i] === ')') {
      if (openStack.length > 0) openStack.pop();
      else keep[i] = false;
    }
  }
  for (const index of openStack) keep[index] = false;
  return [...value].filter((_, i) => keep[i]).join('');
}

/**
 * Cleans a registry name for display on a presentation surface.
 * Returns undefined when nothing legible survives, so a caller renders
 * no name rather than an empty line.
 */
export function normalizeRegistryDisplayName(raw: string): string | undefined {
  const collapsed = raw.replace(/\s+/gu, ' ').trim();
  if (!collapsed) return undefined;

  // "X (Y)" where Y repeats X: keep X alone. Only an exact repeat is
  // collapsed - a genuinely different trading name in parentheses is
  // real information and stays.
  const duplicated = collapsed.match(/^(.+?)\s*\((.+)\)$/u);
  const deduplicated =
    duplicated && comparisonKey(duplicated[1]!) === comparisonKey(duplicated[2]!)
      ? duplicated[1]!.trim()
      : collapsed;

  const balanced = dropUnbalancedParentheses(deduplicated).replace(/\s+/gu, ' ').trim();
  // Punctuation alone is not a name. Guards the degenerate "()" case
  // rather than rendering it as a company's dénomination sociale.
  return /[\p{L}\p{N}]/u.test(balanced) ? balanced : undefined;
}
