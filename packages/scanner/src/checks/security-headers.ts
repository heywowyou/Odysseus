/**
 * Milestone 8.6: security response headers, a site-level fact fetched
 * once per audit rather than per page - HSTS/CSP/etc. are near-always
 * set by the same server config for every page on a site, so a per-page
 * fetch here would just repeat the same answer at the cost of the
 * politeness budget. Same "one fetch, attributed to the homepage" shape
 * as checks/llms-txt.ts and checks/sitemap.ts.
 *
 * Presence-only, like llms-txt.ts: this reports which of the five
 * headers a response actually set, not whether a directive's contents
 * are well-formed (e.g. a syntactically broken CSP value still counts as
 * "present" here). Judging directive correctness is a distinct, harder
 * problem than judging absence and is out of scope for this pass.
 */

export interface SecurityHeadersCheckResult {
  fetched: boolean;
  isHttps: boolean;
  hasCsp: boolean;
  hasHsts: boolean;
  hasXFrameOptions: boolean;
  hasReferrerPolicy: boolean;
  hasPermissionsPolicy: boolean;
  fetchError?: string;
}

export async function checkSecurityHeaders(origin: string, timeoutMs: number): Promise<SecurityHeadersCheckResult> {
  const isHttps = new URL(origin).protocol === 'https:';
  try {
    const response = await fetch(origin, { signal: AbortSignal.timeout(timeoutMs) });
    return {
      fetched: true,
      isHttps,
      hasCsp: response.headers.has('content-security-policy'),
      hasHsts: response.headers.has('strict-transport-security'),
      hasXFrameOptions: response.headers.has('x-frame-options'),
      hasReferrerPolicy: response.headers.has('referrer-policy'),
      hasPermissionsPolicy: response.headers.has('permissions-policy'),
    };
  } catch (error) {
    return {
      fetched: false,
      isHttps,
      hasCsp: false,
      hasHsts: false,
      hasXFrameOptions: false,
      hasReferrerPolicy: false,
      hasPermissionsPolicy: false,
      fetchError: error instanceof Error ? error.message : String(error),
    };
  }
}
