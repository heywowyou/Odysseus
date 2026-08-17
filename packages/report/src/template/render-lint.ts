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
