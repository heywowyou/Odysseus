/**
 * B2: a render-lint pass over the fully composed HTML string, catching
 * the class of bug where a template variable is left unfilled - a bare
 * "Manquant : 100% ... sur -." was shipped to a real client because
 * nothing checked the final output for leftover placeholder syntax or
 * stringified-undefined artifacts. Runs against renderHtml()'s plain
 * string output; a Paged.js pagination pass changes layout, not text
 * content, so there is nothing this check would catch there that it
 * wouldn't already catch here.
 */
const FORBIDDEN_PATTERNS: readonly { label: string; pattern: RegExp }[] = [
  { label: 'unresolved template placeholder "{{"', pattern: /\{\{/ },
  { label: 'unresolved template placeholder "}}"', pattern: /\}\}/ },
  { label: 'stringified undefined', pattern: /undefined/ },
  { label: 'stringified NaN', pattern: /\bNaN\b/ },
  { label: 'stringified null', pattern: /\bnull\b/ },
  { label: 'stringified object', pattern: /\[object Object\]/ },
  // A trailing "sur -." / "sur - ." is the specific shape B2 shipped:
  // a template clause filled with a placeholder hyphen instead of being
  // omitted when its value was empty.
  { label: 'placeholder hyphen before a sentence-ending period', pattern: / -\s?\.(?!\w)/ },
  // Item 0.3: a "?" filled in for an unmeasured numeric value ("HTML brut
  // - ? caractères"), not a real French question mark, which never sits
  // directly in front of a unit noun like this. Scoped to the specific
  // units this report renders numbers next to, so it doesn't flag a
  // genuine "Une question ?".
  {
    label: 'placeholder "?" in place of an unmeasured number',
    pattern: /\?\s*(caractères|occurrences?|constats?|pages?|%)/i,
  },
  // item 3.2: a real report shipped "1 page(s) ont été exclues" - a
  // pluralisation placeholder left unresolved (a French/English word
  // followed by a literal "(s)") rather than a real singular/plural
  // choice. A genuine English "(s)" abbreviation has no legitimate use
  // in this report's copy, so a bare match is enough, no word-boundary
  // allowlist needed.
  { label: 'unresolved pluralisation placeholder "(s)"', pattern: /\(s\)/ },
  // P0.4 (2026-08-21 La Corniche feedback pass): ODYSSEUS_SIRET_PLACEHOLDER
  // ("[SIRET à renseigner]") reached a real client-facing PDF. Matches the
  // general "[... à renseigner]" bracket convention (html-utils.ts's own
  // doc comment names this as the deliberate placeholder shape, chosen
  // specifically so it never looks like a plausible real value) so any
  // future placeholder using the same convention is caught the same way,
  // not just this one field.
  { label: 'unfilled "[... à renseigner]" placeholder', pattern: /\[[^[\]]*à renseigner\]/ },
];

export interface RenderLintViolation {
  label: string;
  /** A short window of HTML around the match, for a useful test failure
   *  message without dumping the whole document. */
  context: string;
}

export function findRenderLintViolations(html: string): RenderLintViolation[] {
  const violations: RenderLintViolation[] = [];
  for (const { label, pattern } of FORBIDDEN_PATTERNS) {
    const match = html.match(pattern);
    if (match?.index !== undefined) {
      const start = Math.max(0, match.index - 40);
      const end = Math.min(html.length, match.index + match[0].length + 40);
      violations.push({ label, context: html.slice(start, end) });
    }
  }
  return violations;
}
