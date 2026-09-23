/** Shared, pure host-response and document-wall classification.
 *
 * The scanner and normalization agree on these bounded signals. Page markup
 * is inspected in memory and never needs to be stored or passed downstream.
 */

export const MINIMAL_RAW_MARKUP_LENGTH = 512;
export const MINIMUM_CHALLENGE_TEXT_LENGTH = 500;

export const CHALLENGE_TITLE_PATTERNS: readonly RegExp[] = [
  /security\s+check/i,
  /security\s+verification/i,
  /verifying\s+(you are|your browser)/i,
  /checking\s+your\s+browser/i,
  /just a moment/i,
  /attention required/i,
  /test de s[ée]curit[ée]/i,
  /v[ée]rification anti[- ]robot/i,
];

interface MarkerPattern {
  name: string;
  pattern: RegExp;
}

/** A vendor name alone is not a challenge marker. DataDome script URLs and
 * challenge-platform scripts can appear on ordinary pages. */
export const HOST_SIGNAL_MARKER_PATTERNS: readonly MarkerPattern[] = [
  { name: 'bot-challenge', pattern: /cf[-_]chl|cf-browser-verification|challenge-platform/i },
  { name: 'o2switch-challenge', pattern: /o2swit\.ch\/assets\/tiger\.svg/i },
  { name: 'datadome-challenge', pattern: /(?:static\.)?captcha-delivery\.com/i },
  {
    name: 'waf-security-check',
    pattern: /test\s+de\s+s[ée]curit[ée]|security\s+(?:check|verification)/i,
  },
  { name: 'bot-challenge-title', pattern: /<title>\s*(just a moment|attention required)/i },
  { name: 'meta-refresh', pattern: /<meta[^>]+http-equiv=["']?refresh["']?[^>]*>/i },
  { name: 'access-denied', pattern: /<title>\s*(403 forbidden|access denied)/i },
];

const CHALLENGE_MARKER_NAMES = new Set([
  'bot-challenge',
  'bot-challenge-title',
  'challenge-title',
  'access-denied',
  'o2switch-challenge',
  'datadome-challenge',
  'waf-security-check',
]);

const WALL_SHAPE_MARKERS = new Set([
  'bot-challenge',
  'bot-challenge-title',
  'access-denied',
  'o2switch-challenge',
  'datadome-challenge',
  'waf-security-check',
]);

export type DocumentWallClassification =
  | {
      classification: 'wall';
      reason:
        | 'challenge-title'
        | 'http-rate-limit'
        | 'challenge-status'
        | 'challenge-sparse-text'
        | 'challenge-minimal-markup'
        | 'minimal-meta-refresh';
    }
  | { classification: 'content'; reason: 'no-barrier-signal' };

export interface ClassifyDocumentWallInput {
  status?: number;
  title?: string | null;
  markupLength?: number;
  visibleTextLength?: number;
  markers?: readonly string[];
}

export function isChallengeTitle(title: string | null | undefined): boolean {
  return (
    title !== undefined &&
    title !== null &&
    CHALLENGE_TITLE_PATTERNS.some((pattern) => pattern.test(title))
  );
}

/** Recognizes an explicit marker name or one of the shared vendor patterns. */
export function isChallengeMarker(value: string | null | undefined): boolean {
  if (value === undefined || value === null) return false;
  const normalized = value.trim().toLowerCase();
  return (
    CHALLENGE_MARKER_NAMES.has(normalized) ||
    HOST_SIGNAL_MARKER_PATTERNS.some(
      ({ name, pattern }) => name === normalized || pattern.test(value),
    )
  );
}

export function extractHostSignalMarkers(markup: string): string[] {
  return HOST_SIGNAL_MARKER_PATTERNS.filter(({ pattern }) => pattern.test(markup)).map(
    ({ name }) => name,
  );
}

export function classifyDocumentWall(input: ClassifyDocumentWallInput): DocumentWallClassification {
  const markers = new Set(input.markers ?? []);
  if (isChallengeTitle(input.title)) {
    return { classification: 'wall', reason: 'challenge-title' };
  }

  // A 429 explicitly refuses the request for rate reasons. Older artifacts
  // may not retain enough body evidence to name the challenge vendor.
  if (input.status === 429) {
    return { classification: 'wall', reason: 'http-rate-limit' };
  }

  const hasWallMarker = [...markers].some((marker) => WALL_SHAPE_MARKERS.has(marker));
  if (hasWallMarker && (input.status === 403 || input.status === 429 || input.status === 503)) {
    return { classification: 'wall', reason: 'challenge-status' };
  }
  if (
    hasWallMarker &&
    input.visibleTextLength !== undefined &&
    input.visibleTextLength < MINIMUM_CHALLENGE_TEXT_LENGTH
  ) {
    return { classification: 'wall', reason: 'challenge-sparse-text' };
  }
  if (
    hasWallMarker &&
    input.markupLength !== undefined &&
    input.markupLength <= MINIMAL_RAW_MARKUP_LENGTH
  ) {
    return { classification: 'wall', reason: 'challenge-minimal-markup' };
  }
  if (
    markers.has('meta-refresh') &&
    input.markupLength !== undefined &&
    input.markupLength <= MINIMAL_RAW_MARKUP_LENGTH
  ) {
    return { classification: 'wall', reason: 'minimal-meta-refresh' };
  }
  return { classification: 'content', reason: 'no-barrier-signal' };
}

export type HostResponseClassification =
  | { disposition: 'pushback'; reason: 'rate-limit' | 'origin-transient'; auditedHost: true }
  | { disposition: 'page-error'; reason: 'http-error'; auditedHost: true }
  | {
      disposition: 'none';
      reason: 'not-audited-host' | 'no-pushback-status';
      auditedHost: boolean;
    };

export interface ClassifyHostResponseInput {
  requestedHost: string;
  landedHost?: string | null;
  auditedHostAliases: readonly string[];
  status?: number;
  retryAfterMs?: number;
  /** Consecutive audited-host 5xx document responses, including this one. */
  consecutiveOriginServerErrors?: number;
}

function normalizedHostname(host: string | null | undefined): string | undefined {
  if (host === undefined || host === null || host.trim() === '') return undefined;
  try {
    const candidate = host.includes('://') ? host : `https://${host}`;
    return new URL(candidate).hostname.toLowerCase().replace(/\.$/u, '');
  } catch {
    return undefined;
  }
}

/** Only the audited hostname and its exact www variant are equivalent. */
export function auditedHostAliases(host: string): string[] {
  const normalized = normalizedHostname(host);
  if (normalized === undefined) return [];
  const bare = normalized.replace(/^www\./u, '');
  return [...new Set([bare, `www.${bare}`])];
}

export function classifyHostResponse(input: ClassifyHostResponseInput): HostResponseClassification {
  const requestedHost = normalizedHostname(input.requestedHost);
  const landedHost = normalizedHostname(input.landedHost ?? input.requestedHost);
  const aliases = new Set(
    input.auditedHostAliases
      .map(normalizedHostname)
      .filter((alias): alias is string => alias !== undefined),
  );
  const auditedHost =
    requestedHost !== undefined &&
    landedHost !== undefined &&
    aliases.has(requestedHost) &&
    aliases.has(landedHost);
  if (!auditedHost) {
    return { disposition: 'none', reason: 'not-audited-host', auditedHost: false };
  }

  if (input.status === 429) {
    return { disposition: 'pushback', reason: 'rate-limit', auditedHost: true };
  }
  if (input.status === 503 || input.retryAfterMs !== undefined) {
    return { disposition: 'pushback', reason: 'origin-transient', auditedHost: true };
  }
  if ((input.status ?? 0) >= 500 && (input.consecutiveOriginServerErrors ?? 0) >= 3) {
    return { disposition: 'pushback', reason: 'origin-transient', auditedHost: true };
  }
  if ((input.status ?? 0) >= 400) {
    return { disposition: 'page-error', reason: 'http-error', auditedHost: true };
  }
  return { disposition: 'none', reason: 'no-pushback-status', auditedHost: true };
}
