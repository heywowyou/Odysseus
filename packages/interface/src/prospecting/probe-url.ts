/**
 * A bounded HTTP probe that keeps the reason a request failed.
 *
 * fetch-candidate-page.ts's fetchPageText returns null on every failure, which
 * is right for milestone 9a - a site publishing no resolvable SIREN is simply
 * not a prospect, and why it failed changes nothing. Plan 003 needs the
 * opposite: the loss-reason table is the deliverable, and "7,000 sites
 * returned null" is not a measurement. So this is a sibling, not an edit -
 * fetchPageText's behaviour is depended on by the shipped 9a path and stays
 * exactly as it is.
 *
 * Two differences beyond the typed failures. Redirects are followed manually
 * with a bounded hop count, because `redirect: 'follow'` cannot tell a hotel
 * whose domain now points at booking.com from one that simply moved to https;
 * that distinction is the difference between a rejected candidate and a
 * qualified one. And DNS and TLS failures are told apart by the error cause
 * code Node already attaches, rather than by opening a second socket to ask
 * again: undici surfaces ENOTFOUND and the OpenSSL certificate codes on
 * `cause`, so a separate node:dns or node:tls probe would be a second round
 * trip to learn what the first one already reported.
 */

const MAX_REDIRECT_HOPS = 5;

export type ProbeFailure =
  | 'dns-unresolved'
  | 'tls-invalid'
  | 'redirect-loop'
  | 'redirect-offsite'
  | 'http-error'
  | 'non-html-response'
  | 'timeout';

export type ProbeResult =
  | {
      kind: 'ok';
      finalUrl: string;
      html: string;
      /** True when the chain moved but stayed on the same registrable domain,
       *  which is normal (http to https, apex to www) and worth recording
       *  without being worth acting on. */
      redirectedWithinSite: boolean;
    }
  | { kind: 'failed'; failure: ProbeFailure; detail: string; finalUrl?: string };

/** OpenSSL and undici error codes that mean the certificate itself is the
 *  problem, as opposed to the host being absent or refusing the connection.
 *  Listed explicitly rather than matched on a substring: 'CERT' appears in
 *  codes that are not certificate validity failures. */
const TLS_ERROR_CODES: ReadonlySet<string> = new Set([
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'HOSTNAME_MISMATCH',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_SSL_WRONG_VERSION_NUMBER',
  'EPROTO',
]);

/** Codes meaning the name did not resolve or the host is simply not there.
 *  ECONNREFUSED is grouped with DNS deliberately: from the campaign's point of
 *  view "the domain does not serve a website" is one fact, and splitting it
 *  would add a reason nobody would act on differently. */
const UNREACHABLE_ERROR_CODES: ReadonlySet<string> = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

function errorCodeOf(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '';
  const cause = (error as { cause?: unknown }).cause;
  const fromCause =
    typeof cause === 'object' && cause !== null ? (cause as { code?: unknown }).code : undefined;
  const fromError = (error as { code?: unknown }).code;
  const code = fromCause ?? fromError;
  return typeof code === 'string' ? code : '';
}

function classifyFetchError(error: unknown): { failure: ProbeFailure; detail: string } {
  if (error instanceof Error && error.name === 'AbortError') {
    return { failure: 'timeout', detail: 'request aborted at the configured timeout' };
  }
  const code = errorCodeOf(error);
  if (
    code === 'ETIMEDOUT' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'UND_ERR_HEADERS_TIMEOUT'
  ) {
    return { failure: 'timeout', detail: code };
  }
  if (TLS_ERROR_CODES.has(code)) return { failure: 'tls-invalid', detail: code };
  if (UNREACHABLE_ERROR_CODES.has(code)) return { failure: 'dns-unresolved', detail: code };
  // An unrecognised transport failure is reported as unreachable rather than
  // as a new bucket: it is the honest summary, and the detail string keeps the
  // original code so an unexpected pattern is visible in stored data.
  return { failure: 'dns-unresolved', detail: code === '' ? 'unknown transport failure' : code };
}

function isHtml(contentType: string | null): boolean {
  if (contentType === null) return true; // No declaration; the body decides.
  return /\b(text\/html|application\/xhtml\+xml)\b/i.test(contentType);
}

/**
 * @param sameSite decides whether a redirect destination counts as staying on
 *   the hotel's own site. Injected rather than computed here so the registrable
 *   domain rule stays in core, where the public suffix list already lives.
 */
export async function probeUrl(
  url: string,
  options: { timeoutMs: number; userAgent: string; sameSite: (candidateUrl: string) => boolean },
): Promise<ProbeResult> {
  let currentUrl = url;
  const seen = new Set<string>();
  let redirectedWithinSite = false;

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    if (seen.has(currentUrl)) {
      return {
        kind: 'failed',
        failure: 'redirect-loop',
        detail: `revisited ${currentUrl}`,
        finalUrl: currentUrl,
      };
    }
    seen.add(currentUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    let response: Response;
    try {
      response = await fetch(currentUrl, {
        headers: { 'User-Agent': options.userAgent },
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch (error) {
      const { failure, detail } = classifyFetchError(error);
      return { kind: 'failed', failure, detail, finalUrl: currentUrl };
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location === null) {
        return {
          kind: 'failed',
          failure: 'http-error',
          detail: `${response.status} with no Location header`,
          finalUrl: currentUrl,
        };
      }
      let next: string;
      try {
        next = new URL(location, currentUrl).href;
      } catch {
        return {
          kind: 'failed',
          failure: 'http-error',
          detail: `${response.status} with an unusable Location`,
          finalUrl: currentUrl,
        };
      }
      if (!options.sameSite(next)) {
        return { kind: 'failed', failure: 'redirect-offsite', detail: next, finalUrl: next };
      }
      redirectedWithinSite = true;
      currentUrl = next;
      continue;
    }

    if (!response.ok) {
      return {
        kind: 'failed',
        failure: 'http-error',
        detail: String(response.status),
        finalUrl: currentUrl,
      };
    }

    if (!isHtml(response.headers.get('content-type'))) {
      return {
        kind: 'failed',
        failure: 'non-html-response',
        detail: response.headers.get('content-type') ?? '',
        finalUrl: currentUrl,
      };
    }

    let html: string;
    try {
      html = await response.text();
    } catch (error) {
      const { failure, detail } = classifyFetchError(error);
      return { kind: 'failed', failure, detail, finalUrl: currentUrl };
    }
    return { kind: 'ok', finalUrl: currentUrl, html, redirectedWithinSite };
  }

  return {
    kind: 'failed',
    failure: 'redirect-loop',
    detail: `more than ${MAX_REDIRECT_HOPS} redirects`,
    finalUrl: currentUrl,
  };
}
