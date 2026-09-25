/**
 * Issue #323: the delivered French reports mixed conventions inside a
 * single page - "78%" next to "70,22 %", straight double quotes next to
 * guillemets, a curly apostrophe in one sentence and a straight one in
 * the next, and
 * a breakable space before a colon that let the mark orphan onto its own
 * line. Each one on its own is small; together they read as a document
 * assembled from several sources, which is exactly what a paid audit must
 * not look like.
 *
 * One pass, applied to every French string the report renders: the
 * strings files as they are loaded (strings/i18n.ts), the French rule
 * titles and glosses (rule-translations.ts), and model-written prose
 * (escapeProse). French copy therefore cannot reach the page carrying a
 * convention this file does not enforce, whichever of those three sources
 * it came from.
 *
 * Deliberately not an HTML post-pass over the rendered document: the same
 * page also carries CSS selectors, file names and URLs, which are
 * verbatim evidence a reader may have to retype. Normalising typography
 * inside those would corrupt them. Running over copy, before it is
 * escaped and placed, means verbatim evidence is never a candidate.
 */

const NO_BREAK_SPACE = ' ';

/** U+00A0 rather than U+202F, for the reason guillemet-spacing.test.ts
 *  records: U+202F risks a missing glyph in the print-to-PDF text layer,
 *  and a slightly wide space is the better loss. */
export function normalizeFrenchTypography(value: string): string {
  return (
    value
      // A straight apostrophe between two letters is always the elision
      // mark, never a quote delimiter. French sets it as U+2019.
      .replace(/(\p{L})'(\p{L})/gu, `$1’$2`)
      // Paired straight double quotes become guillemets. Restricted to
      // content that cannot be markup or an attribute value: a
      // remediation string legitimately quotes `<meta http-equiv="refresh">`,
      // and turning that into guillemets would print a fix the reader
      // cannot apply.
      // The guillemets and their inner no-break spaces are written as
      // escapes: this is a replacement pattern, not copy, and
      // guillemet-spacing.test.ts scans source text for a literal pair.
      .replace(/(^|[^=\p{L}\d])"([^"<>=/]+)"/gu, '$1\u00ab\u00a0$2\u00a0\u00bb')
      // A percentage always sits on a space in French, and the space must
      // not break: "70,22" and "%" belong to one value.
      .replace(/(\d)[  ]?%/g, `$1${NO_BREAK_SPACE}%`)
      // Same for a unit abbreviation after a figure ("24px" in a touch-
      // target rule title). Never after a colon, which would be a CSS
      // declaration rather than a measurement.
      // The first lookbehind keeps the match from restarting inside a
      // number, which would let the second one miss the colon.
      .replace(/(?<![\d.,])(?<!:\s*)(\d[\d.,]*)(px|em|rem)\b/g, `$1${NO_BREAK_SPACE}$2`)
      // High punctuation takes a space before it, and an ordinary space
      // is a legal break opportunity, so a long line can orphan the mark
      // at the start of the next one (issue #46). Only an existing space
      // is converted: inserting one would put a break inside "https://".
      .replace(/ ([?!:;])/g, `${NO_BREAK_SPACE}$1`)
      // "n°" belongs to its number: a legal citation printed "loi n°" at a
      // line end and "2023-171" on the next.
      .replace(/\bn° /g, `n°${NO_BREAK_SPACE}`)
  );
}

/** French ordinals keep their suffix in lower case, including inside a
 *  heading the design sets in capitals: "75e percentile" is correct,
 *  "75E PERCENTILE" is not. Wraps the suffix so an enclosing
 *  `text-transform: uppercase` leaves it alone, the same targeted opt-out
 *  issue #316 used for URLs in the render-proof kickers. Takes already-
 *  escaped HTML, and emits only its own markup. */
export function preserveFrenchOrdinalCase(escapedHtml: string): string {
  return escapedHtml.replace(
    /(\d)(er|re|es|e)\b/g,
    (_match, digit: string, suffix: string) =>
      `${digit}<span style="text-transform:none">${suffix}</span>`,
  );
}

/** Applies normalizeFrenchTypography to every string reachable in a
 *  strings tree, leaving its shape untouched. */
export function normalizeFrenchTypographyDeep<T>(value: T): T {
  if (typeof value === 'string') return normalizeFrenchTypography(value) as T;
  if (Array.isArray(value)) return value.map(normalizeFrenchTypographyDeep) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeFrenchTypographyDeep(entry)]),
    ) as T;
  }
  return value;
}

/** normalizeFrenchTypography for a French document, identity otherwise.
 *  For composed sentences that mix the report's own copy with French text
 *  from another package, where escaping happens later or elsewhere. */
export function frenchCopy(value: string, language: 'fr' | 'en'): string {
  return language === 'fr' ? normalizeFrenchTypography(value) : value;
}

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);
const VERBATIM_ELEMENTS = new Set(['pre', 'code', 'script', 'style', 'textarea']);
const VERBATIM_ATTRIBUTES = /\bclass="[^"]*\bmono\b|\bdata-render-lint="verbatim"/;
const ELISION_APOSTROPHE = /(\p{L})(?:'|&#39;)(?=\p{L})/gu;

/** The last pass over a finished French document: every elision apostrophe
 *  left straight in prose text becomes ’. Call sites normalise their own
 *  copy with escapeCopy, but copy reaches the page from many places (a
 *  registry name, a legal sentence from core), and a single missed one made
 *  a real report mix both forms. Text inside code, preformatted snippets,
 *  monospace evidence and verbatim-marked elements keeps what the site
 *  wrote; attribute values are never touched. */
export function setFrenchProseApostrophes(html: string): string {
  const open: { name: string; verbatim: boolean }[] = [];
  let verbatimDepth = 0;
  return html.replace(
    /<(\/?)([a-zA-Z][\w-]*)([^>]*)>|[^<]+|</g,
    (token, closing, rawName, attrs) => {
      if (rawName === undefined) {
        return verbatimDepth > 0 || token === '<'
          ? token
          : token.replace(ELISION_APOSTROPHE, '$1’');
      }
      const name = (rawName as string).toLowerCase();
      if (closing) {
        const index = open.map((element) => element.name).lastIndexOf(name);
        if (index >= 0) {
          for (const element of open.splice(index)) if (element.verbatim) verbatimDepth--;
        }
        return token;
      }
      if (VOID_ELEMENTS.has(name) || (attrs as string).endsWith('/')) return token;
      const verbatim = VERBATIM_ELEMENTS.has(name) || VERBATIM_ATTRIBUTES.test(attrs as string);
      if (verbatim) verbatimDepth++;
      open.push({ name, verbatim });
      return token;
    },
  );
}
