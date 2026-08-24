/**
 * Milestone 8.6: violation judgment for the security response headers
 * check. Site-level, attributed to the homepage, same "attribute a
 * site-level fact to the one page every site has" pattern llms-txt.ts and
 * sitemap.ts already established. A fetch failure (fetched: false)
 * produces no candidates at all rather than guessing - an unreachable
 * origin is a crawl-level problem this check has no business reporting
 * on, and the http-error-status/broken-internal-link checks already
 * cover reachability.
 */

import type { FindingCandidate } from './candidate.js';
import { severityFromCustom } from './severity.js';

export const SECURITY_HEADER_MISSING_CSP_RULE_ID = 'security-header-missing-csp';
export const SECURITY_HEADER_MISSING_HSTS_RULE_ID = 'security-header-missing-hsts';
export const SECURITY_HEADER_MISSING_X_FRAME_OPTIONS_RULE_ID = 'security-header-missing-x-frame-options';
export const SECURITY_HEADER_MISSING_REFERRER_POLICY_RULE_ID = 'security-header-missing-referrer-policy';
export const SECURITY_HEADER_MISSING_PERMISSIONS_POLICY_RULE_ID = 'security-header-missing-permissions-policy';

export interface SecurityHeadersCheckInput {
  fetched: boolean;
  isHttps: boolean;
  hasCsp: boolean;
  hasHsts: boolean;
  hasXFrameOptions: boolean;
  hasReferrerPolicy: boolean;
  hasPermissionsPolicy: boolean;
}

function candidate(ruleId: string, title: string, description: string, pageUrl: string): FindingCandidate {
  return {
    source: 'custom',
    ruleId,
    category: 'privacy',
    severity: severityFromCustom(ruleId),
    wcagCriteria: [],
    title,
    description,
    pageUrl,
    element: null,
    rawEvidenceForPage: {},
  };
}

export function extractSecurityHeadersCandidates(
  input: SecurityHeadersCheckInput,
  pageUrl: string,
): FindingCandidate[] {
  if (!input.fetched) return [];

  const candidates: FindingCandidate[] = [];

  if (!input.hasCsp) {
    candidates.push(
      candidate(
        SECURITY_HEADER_MISSING_CSP_RULE_ID,
        'No Content-Security-Policy header',
        'This site does not send a Content-Security-Policy header. CSP is the main browser-enforced defense against cross-site scripting and data-injection attacks; without it, a successful script injection can run unrestricted.',
        pageUrl,
      ),
    );
  }

  // HSTS only means anything on an https origin - it tells browsers to
  // never fall back to plain http for this site. An http-only site has a
  // more fundamental problem (mixed-content.ts and Lighthouse's own
  // https-usage-style checks already cover that), so this stays silent
  // rather than reporting a header that would be meaningless here.
  if (input.isHttps && !input.hasHsts) {
    candidates.push(
      candidate(
        SECURITY_HEADER_MISSING_HSTS_RULE_ID,
        'No Strict-Transport-Security header',
        'This site is served over https but does not send a Strict-Transport-Security header. Without HSTS, a visitor whose first request happens to go out over http (e.g. a typed URL with no scheme) can be intercepted before the redirect to https ever occurs.',
        pageUrl,
      ),
    );
  }

  if (!input.hasXFrameOptions) {
    candidates.push(
      candidate(
        SECURITY_HEADER_MISSING_X_FRAME_OPTIONS_RULE_ID,
        'No X-Frame-Options header',
        'This site does not send an X-Frame-Options header. Without it, the site can be embedded in a hidden frame on another site and used for clickjacking, tricking a visitor into clicking something other than what they see.',
        pageUrl,
      ),
    );
  }

  if (!input.hasReferrerPolicy) {
    candidates.push(
      candidate(
        SECURITY_HEADER_MISSING_REFERRER_POLICY_RULE_ID,
        'No Referrer-Policy header',
        'This site does not send a Referrer-Policy header. Without one, the browser default can leak the full URL a visitor came from, including any sensitive query parameters, to every third-party resource the page loads.',
        pageUrl,
      ),
    );
  }

  if (!input.hasPermissionsPolicy) {
    candidates.push(
      candidate(
        SECURITY_HEADER_MISSING_PERMISSIONS_POLICY_RULE_ID,
        'No Permissions-Policy header',
        'This site does not send a Permissions-Policy header. Without one, embedded third-party content is not restricted from using browser features (camera, microphone, geolocation) it has no legitimate need for.',
        pageUrl,
      ),
    );
  }

  return candidates;
}
