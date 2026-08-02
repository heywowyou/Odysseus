const BODY_RE = /<body[^>]*>([\s\S]*?)<\/body>/i;
const COMMENT_RE = /<!--[\s\S]*?-->/g;
const SCRIPT_STYLE_RE = /<(script|style)[^>]*>[\s\S]*?<\/\1>/gi;
const TAG_RE = /<[^>]+>/g;
const ENTITY_RE = /&[a-z#0-9]+;/gi;

const NAMED_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

/**
 * Approximates what a non-executing HTML fetcher sees: text nodes in the
 * served markup, with no CSS/layout engine to resolve visibility. Used
 * for the raw pass, where page.evaluate() is unreachable because the
 * context has JavaScript disabled.
 *
 * Scoped to <body> content when present, to match what the rendered
 * pass measures (document.body.innerText) - otherwise <head> text like
 * <title> would count as "visible" on the raw side but not the rendered
 * side, skewing the comparison.
 */
export function extractTextFromHtml(html: string): string {
  const bodyMatch = BODY_RE.exec(html);
  const scoped = bodyMatch ? bodyMatch[1]! : html;
  const stripped = scoped
    .replace(COMMENT_RE, ' ')
    .replace(SCRIPT_STYLE_RE, ' ')
    .replace(TAG_RE, ' ');
  const decoded = stripped.replace(ENTITY_RE, (match) => NAMED_ENTITIES[match] ?? match);
  return decoded.replace(/\s+/g, ' ').trim();
}

/**
 * 0 means a crawler sees everything, 100 means it sees nothing. Guards
 * renderedTextLength <= 0: if the rendered pass itself produced no text,
 * there is nothing to be "missing from" and 0 is the honest answer (a
 * broken render shows up via consoleErrors/httpStatus instead).
 */
export function computeMissingPercent(rawTextLength: number, renderedTextLength: number): number {
  if (renderedTextLength <= 0) return 0;
  const missing = renderedTextLength - rawTextLength;
  const percent = (missing / renderedTextLength) * 100;
  return Math.min(100, Math.max(0, Math.round(percent * 100) / 100));
}
