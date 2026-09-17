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
  //
  // Issue #385: a word unit needs real whitespace after the "?" and a word
  // boundary after the unit. Without both, a URL's query string
  // ("/en?page_id=15968") matched as "?page" and blocked a valid report.
  // "?%" stays accepted with or without a space, but not when the "%"
  // opens a percent-encoded octet ("?%C3%A9=...") in a URL.
  {
    label: 'placeholder "?" in place of an unmeasured number',
    pattern:
      /\?(?:\s+(?:caractères|occurrences?|constats?|pages?)(?![\p{L}\p{N}_])|\s*%(?![0-9a-f]{2}))/iu,
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
  // A6 (2026-08-24 three-site review): real La Corniche and Haaitza
  // reports printed "des liens *hreflang* non réciproques" and "un
  // attribut *aria-label*" with the asterisks visible - the model reached
  // for inline emphasis inside a JSON field value, which the prompt's
  // "no markdown fences" instruction never covered. escapeProse
  // (html-utils.ts) strips it at every LLM-prose render point; this
  // catches any render point that is added later and forgets to.
  //
  // Matched on the escaped form the document actually contains: a
  // delimiter pair around text with no intervening newline or second
  // delimiter. A lone asterisk (a hotel's "5*****", a footnote marker)
  // has no pair and does not match.
  //
  // Underscore emphasis requires a word boundary on the outside of each
  // delimiter, the way markdown itself does. Without that, any
  // snake_case identifier that happens to contain two underscores
  // matches - `.pagedjs_page_content` in the stylesheet did exactly that
  // on the first attempt at this rule.
  //
  // Issue #70: a Lighthouse finding's evidence listing can carry a
  // Next.js chunk filename like "/_next/static/immutable/chunks/
  // 0vw0c0r7hvkh_.js" - two underscores belonging to unrelated tokens
  // joined only by an intervening file path, not one identifier, so the
  // boundary check above lets it through. Excluding "/" from the
  // underscore alternatives' interior rejects any path-like span; a
  // genuine emphasis span in this report's prose never contains a slash.
  {
    label: 'leaked markdown emphasis in rendered prose',
    pattern:
      /(?:\*\*(?=\S)[^*\n<>]{1,80}(?<=\S)\*\*|\*(?=\S)[^*\n<>]{1,80}(?<=\S)\*|(?<![\w-])__(?=\S)[^_\n<>/]{1,80}(?<=\S)__(?![\w-])|(?<![\w-])_(?=\S)[^_\n<>/]{1,80}(?<=\S)_(?![\w-]))/,
  },
];

/** Marks an element whose text is scanner evidence quoted verbatim from the
 *  audited site (a CSS selector axe captured, example code built from one),
 *  never text this renderer composed. Issue #377: a hotel site built with
 *  styled-components forwarded an object prop to its own DOM, so axe's
 *  selector for that node really was `.sc-column[spacing="[object Object]"]`,
 *  and the report quoting it faithfully tripped the stringified-object rule.
 *  Rewriting the selector would falsify evidence; the lint's job is catching
 *  this renderer's own leaks, so a marked element's escaped text is skipped
 *  and every rule still runs on everything else. */
export const VERBATIM_EVIDENCE_ATTRIBUTE = 'data-render-lint="verbatim"';

/** Style and script bodies are not prose. They are full of characters the
 *  prose rules legitimately forbid (a CSS custom property's dashes, a
 *  snake_case class name's underscores), and a client never reads them.
 *  Stripped before every rule runs, not just the markdown one, so no
 *  future rule has to rediscover this. */
function stripNonProse(html: string): string {
  return html
    .replace(VERBATIM_EVIDENCE_ELEMENT, '<$1$2> </$1>')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ');
}

/** Only the marked element's own text is skipped: `[^<]*` cannot run past a
 *  nested tag, and escapeHtml guarantees quoted evidence contains no raw
 *  "<", so a marker can never hide template markup that follows it. */
const VERBATIM_EVIDENCE_ELEMENT =
  /<(\w+)(\s[^>]*\bdata-render-lint="verbatim"[^>]*)>[^<]*<\/\1>/giu;

export interface RenderLintViolation {
  label: string;
  /** A short window of HTML around the match, for a useful test failure
   *  message without dumping the whole document. */
  context: string;
}

export function findRenderLintViolations(rawHtml: string): RenderLintViolation[] {
  const html = stripNonProse(rawHtml);
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
