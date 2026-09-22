/**
 * Canonical URL identity used by both the crawler and normalization.
 *
 * This deliberately does not decode escaped octets. Decoding can turn two
 * distinct server routes into one guessed route; casing an existing escape is
 * the safe equivalence the URL identity contract needs.
 */
function uppercasePercentEscapes(value: string): string {
  return value.replace(/%[0-9a-f]{2}/gi, (escape) => escape.toUpperCase());
}

export function normalizeUrlIdentity(input: string, base?: string): string | undefined {
  let url: URL;
  try {
    url = base === undefined ? new URL(input) : new URL(input, base);
  } catch {
    return undefined;
  }

  url.hash = '';
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }
  url.pathname = uppercasePercentEscapes(url.pathname);
  // URL preserves an explicit trailing `?` in href while exposing an empty
  // search string. Assigning the empty string removes that spelling-only
  // distinction without changing real query parameters.
  url.search = uppercasePercentEscapes(url.search);
  if (url.search === '') url.search = '';

  return url.toString();
}

export function sameUrlIdentity(left: string, right: string): boolean {
  const normalizedLeft = normalizeUrlIdentity(left);
  const normalizedRight = normalizeUrlIdentity(right);
  return normalizedLeft !== undefined && normalizedLeft === normalizedRight;
}
