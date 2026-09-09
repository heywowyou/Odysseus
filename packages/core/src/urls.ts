/**
 * URL heuristics shared by more than one package. Kept in core, not
 * duplicated, since packages/llm's diversion logic and the scanner's
 * mentions-legales check both need the exact same definition of "this
 * looks like a legal page" - letting the two drift would mean a page
 * diverted from the LLM as legal could disagree with the page the
 * scanner treats as the mentions-legales page.
 */
export const LEGAL_PATH_PATTERN =
  /(cgu|cgv|conditions|mentions?-legales?|cookies|confidentialite|privacy|terms|legal)/i;

/**
 * Contact-page paths, added for milestone 9c plan 007. Narrower than
 * LEGAL_PATH_PATTERN on purpose, for the reason
 * @odysseus/scanner's findMentionsLegalesUrl gives about its own narrowing: a
 * broad pattern locks onto the wrong page when a site has several that could
 * plausibly match, and here the wrong page costs a request against a
 * third-party site as well as a missed address.
 *
 * `contactez`/`nous-contacter` are the common French imperative forms and
 * `coordonnees` is what a hotel often calls the page carrying its address and
 * mailbox. `contact` alone would also match `/contact-form-success`, which is
 * harmless: it is one bounded request, and any address on it is still validated
 * by the role allowlist before it is kept.
 */
export const CONTACT_PATH_PATTERN = /(nous-contacter|contactez|coordonnees|\bcontact\b|\/contact)/i;

/**
 * URL-pattern heuristic only, no navigation, matching findMentionsLegalesUrl's
 * contract: the caller passes URLs it has reason to believe resolve, and the
 * first match wins.
 */
export function findContactPageUrl(pageUrls: readonly string[]): string | null {
  return pageUrls.find((url) => CONTACT_PATH_PATTERN.test(url)) ?? null;
}

/**
 * True for an absolute http(s) URL that carries no embedded credentials.
 * This is the shape every entry point that feeds the crawler must accept:
 * without the protocol check, any string that merely parses as a URL
 * (including file:// and javascript:) could reach the scanner's own
 * navigation, and credentials in a URL are a phishing shape for the same
 * reason the outreach preview link schema states (`https://user:pass@host`
 * points somewhere other than the visible host suggests). One definition in
 * core, so the dashboard boundary and the CLI commands cannot disagree.
 */
export function isHttpUrlWithoutCredentials(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    // A hostname with no alphanumeric character ('..' parsed from
    // 'http://..', or '-') is never a real site, and the scanner's path
    // builders join hostnames verbatim into artifact directories, so a
    // dot-only host must not pass this validator.
    if (!/[a-zA-Z0-9]/.test(parsed.hostname)) return false;
    return parsed.username === '' && parsed.password === '';
  } catch {
    return false;
  }
}
