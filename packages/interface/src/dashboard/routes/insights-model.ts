import { useCallback, useEffect, useState } from 'react';
import { ApiError, fetchJson } from '../lib/api';
import { usePolling } from '../lib/use-polling';

/**
 * Response types of the plan 013 insight routes (packages/interface/src/
 * routes/prospect-insights.ts) plus the display logic of the prescan,
 * score, evidence, preview, and vendor pages.
 *
 * The types are declared by value rather than imported from @odysseus/store:
 * they describe what crosses the HTTP boundary (dates arrive as ISO strings),
 * the same discipline as audit-detail-types.ts and lib/api-types.ts. Every
 * shape mirrors an operator-views projection, which is the layer that keeps
 * token hashes, object keys, and artifact paths out of these responses.
 */

export type PrescanStatus = 'complete' | 'blocked-by-robots' | 'homepage-unreachable';

export type PrescanPageRole = 'homepage' | 'booking' | 'content';

export type PrescanEvidenceStatus = 'complete' | 'incomplete' | 'none';

export interface PrescanPageResponse {
  role: PrescanPageRole;
  httpStatus: number | null;
  missingPercent: number | null;
  rawTextLength: number | null;
  renderedTextLength: number | null;
  consoleErrorCount: number | null;
  axe: {
    violationCount: number;
    byImpact: { critical: number; serious: number; moderate: number; minor: number };
    affectedElementCount: number;
    ruleIds: string[];
  } | null;
  metrics: {
    largestContentfulPaintMs: number | null;
    cumulativeLayoutShift: number | null;
    longTaskCount: number | null;
    mainThreadBlockingMs: number | null;
    requestCount: number;
    transferBytes: number;
    thirdPartyRequestCount: number;
    sizeUnavailableCount: number;
    observationWindowMs: number;
  } | null;
  bookingEvidenceKinds: string[];
  skippedByRobots: boolean;
  durationMs: number;
}

export interface PrescanResponse {
  prescanId: string;
  prescanVersion: string;
  status: PrescanStatus;
  domain: string;
  startedAt: string;
  durationMs: number;
  robotsTxtFound: boolean;
  absentRoles: { role: PrescanPageRole; reason: string }[];
  evidenceStatus: PrescanEvidenceStatus;
  pages: PrescanPageResponse[];
}

export interface ScoreComponentResponse {
  id: string;
  points: number;
  reason: string;
}

export interface ScoreBreakdownResponse {
  total: number;
  components: ScoreComponentResponse[];
}

export interface ScoreResponse {
  scoreId: string;
  candidateId: string;
  scoringVersion: string;
  prescanId: string;
  computedAt: string;
  worthy: boolean;
  evidenceComplete: boolean;
  brokenness: ScoreBreakdownResponse;
  ability: ScoreBreakdownResponse;
}

export interface ScoreDiffResponse {
  candidateId: string;
  fromVersion: string;
  toVersion: string;
  from: ScoreResponse | null;
  to: ScoreResponse | null;
  brokennessDelta: number | null;
  abilityDelta: number | null;
}

export type Severity = 'critical' | 'serious' | 'moderate' | 'minor';

export type EvidenceAssetResponse =
  | {
      state: 'captured';
      pageRole: PrescanPageRole;
      selectionReason: string;
      byteSize: number;
      width: number;
      height: number;
    }
  | { state: 'omitted'; reason: string };

export interface EvidenceResponse {
  prescanId: string;
  evidenceStatus: 'complete' | 'incomplete';
  renderComparison: EvidenceAssetResponse;
  specificFailure: EvidenceAssetResponse;
  summaries: {
    observation: { fr: string; en: string };
    severity: Severity;
    wcagCriteria: string[];
    pageRole: PrescanPageRole;
  }[];
}

export interface PreviewResponse {
  previewId: string;
  domain: string;
  language: 'fr' | 'en';
  status: 'live' | 'revoked';
  publishedAt: string;
  publicExpiresAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
  prescanVersion: string;
  evidenceVersion: string;
  previewContentVersion: string;
}

/** The current preview is rendered on demand from the prescan evidence, not
 *  retrieved from the published object. A refusal is an expected result of
 *  that evidence gate, while a rejected request remains an ApiError. */
export type PreviewRenderResponse =
  | { rendered: true; html: string }
  | {
      rendered: false;
      refusal:
        | 'candidate-unknown'
        | 'no-prescan'
        | 'evidence-incomplete'
        | 'evidence-schema-outdated'
        | 'prescan-expired';
    };

export interface VendorFingerprintResponse {
  value: string;
  hotels: number;
}

export interface VendorAggregateResponse {
  prescanVersion: string;
  prescansRead: number;
  minimumGroupSize: number;
  bookingHosts: VendorFingerprintResponse[];
  bookingMechanisms: VendorFingerprintResponse[];
  failureRules: VendorFingerprintResponse[];
}

// ---------------------------------------------------------------------------
// Prescan display logic
// ---------------------------------------------------------------------------

/** Distinct booking evidence kinds across the prescan's pages, in stable
 *  order: the per-candidate counterpart of the vendors page's booking
 *  mechanism aggregate. */
export function distinctBookingKinds(prescan: PrescanResponse): string[] {
  const kinds = new Set<string>();
  for (const page of prescan.pages) {
    for (const kind of page.bookingEvidenceKinds) kinds.add(kind);
  }
  return [...kinds].sort((a, b) => (a < b ? -1 : 1));
}

/** Every page role the prescan accounts for: the pages that were captured
 *  first, then the roles known absent with their reason, so the table shows
 *  the full three-page shape and why a missing role is missing. */
export function prescanRows(prescan: PrescanResponse): {
  role: PrescanPageRole;
  reason: string | null;
  page: PrescanPageResponse | null;
}[] {
  const byRole = new Map(prescan.pages.map((page) => [page.role, page]));
  const rows: {
    role: PrescanPageRole;
    reason: string | null;
    page: PrescanPageResponse | null;
  }[] = prescan.pages.map((page) => ({ role: page.role, reason: null, page }));
  for (const absence of prescan.absentRoles) {
    if (!byRole.has(absence.role)) {
      rows.push({ role: absence.role, reason: absence.reason, page: null });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Score display logic
// ---------------------------------------------------------------------------

export type ScoreComponentGroup = 'brokenness' | 'ability';

/** Version choices of the diff selects: the current score's version first,
 *  then the versions of the last fetched diff, deduplicated. The route
 *  interface has no version listing, so the versions the operator has
 *  actually seen are exactly the candidates. */
export function diffVersionOptions(
  score: ScoreResponse | undefined,
  diff: ScoreDiffResponse | undefined,
): string[] {
  const versions: string[] = [];
  const add = (version: string | undefined): void => {
    if (version !== undefined && !versions.includes(version)) versions.push(version);
  };
  add(score?.scoringVersion);
  add(diff?.fromVersion);
  add(diff?.toVersion);
  return versions;
}

export interface ScoreDiffRow {
  field: ScoreComponentGroup;
  before: number | null;
  after: number | null;
  delta: number | null;
}

/** The two group totals side by side. A missing side stays null: an absent
 *  score is never rendered as a zero. */
export function scoreDiffRows(diff: ScoreDiffResponse): ScoreDiffRow[] {
  return [
    {
      field: 'brokenness',
      before: diff.from?.brokenness.total ?? null,
      after: diff.to?.brokenness.total ?? null,
      delta: diff.brokennessDelta,
    },
    {
      field: 'ability',
      before: diff.from?.ability.total ?? null,
      after: diff.to?.ability.total ?? null,
      delta: diff.abilityDelta,
    },
  ];
}

// ---------------------------------------------------------------------------
// Evidence display logic
// ---------------------------------------------------------------------------

/** Slot keys of the two evidence assets, matching the i18n assetNames
 *  table: render comparison first, specific failure second. */
export type EvidenceSlotKey = 'homepage' | 'contact';

export function evidenceAssetRows(evidence: EvidenceResponse): {
  slot: EvidenceSlotKey;
  asset: EvidenceAssetResponse;
}[] {
  return [
    { slot: 'homepage', asset: evidence.renderComparison },
    { slot: 'contact', asset: evidence.specificFailure },
  ];
}

/** Byte size with a neutral unit symbol, so numbers stay readable without
 *  introducing per-page copy: 204800 reads as 200 kB. */
export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) {
    const rounded = Math.round(kb);
    return `${rounded} kB`;
  }
  return `${Math.round(kb / 1024)} MB`;
}

// ---------------------------------------------------------------------------
// Preview display logic
// ---------------------------------------------------------------------------

/** The four operator-visible preview states. 'expired' is derived: the
 *  record still says live but the public expiry has passed, which is what
 *  the public site answers 410 Gone to. */
export type PreviewState = 'live' | 'revoked' | 'expired' | 'none';

export function previewState(preview: PreviewResponse | null, now: number): PreviewState {
  if (preview === null) return 'none';
  if (preview.status === 'revoked') return 'revoked';
  return Date.parse(preview.publicExpiresAt) <= now ? 'expired' : 'live';
}

// ---------------------------------------------------------------------------
// Vendor aggregate display logic
// ---------------------------------------------------------------------------

/** Which list a fingerprint row came from, shown as the raw vocabulary key
 *  so the three kinds stay distinguishable in the single aggregate table. */
export type VendorRowKind = 'booking-host' | 'booking-mechanism' | 'failure-rule';

export interface VendorRow {
  kind: VendorRowKind;
  value: string;
  /** Hotels the fingerprint recurs on. */
  candidates: number;
  /** Hotel count for failure rules, null for booking fingerprints where a
   *  "failure" reading would be wrong. */
  failures: number | null;
  /** Share of the scanned population, in percent, for failure rules. */
  failureRate: number | null;
}

/** One table row per fingerprint, in list order. The failure rate divides by
 *  the prescans actually read, so the percentage always has the denominator
 *  the aggregate counted against. */
export function vendorRows(aggregate: VendorAggregateResponse): VendorRow[] {
  const rate = (hotels: number): number | null =>
    aggregate.prescansRead > 0 ? Math.round((hotels / aggregate.prescansRead) * 1000) / 10 : null;
  const rows: VendorRow[] = [];
  for (const host of aggregate.bookingHosts) {
    rows.push({
      kind: 'booking-host',
      value: host.value,
      candidates: host.hotels,
      failures: null,
      failureRate: null,
    });
  }
  for (const mechanism of aggregate.bookingMechanisms) {
    rows.push({
      kind: 'booking-mechanism',
      value: mechanism.value,
      candidates: mechanism.hotels,
      failures: null,
      failureRate: null,
    });
  }
  for (const rule of aggregate.failureRules) {
    rows.push({
      kind: 'failure-rule',
      value: rule.value,
      candidates: rule.hotels,
      failures: rule.hotels,
      failureRate: rate(rule.hotels),
    });
  }
  return rows;
}

/** Percent share with the operator's decimal conventions, unit suffix
 *  included: 12.5 renders as 12,5% in French and 12.5% in English. */
export function formatFailureRate(rate: number, language: 'fr' | 'en'): string {
  const formatted = rate.toLocaleString(language === 'fr' ? 'fr-FR' : 'en-GB', {
    maximumFractionDigits: 1,
  });
  return `${formatted}%`;
}

// ---------------------------------------------------------------------------
// Shared fetch with a 404 state
// ---------------------------------------------------------------------------

export interface InsightViewState<T> {
  data: T | undefined;
  error: string | undefined;
  isLoading: boolean;
  refresh: () => void;
  isNotFound: boolean;
}

/** useApi-flavoured fetch of one insight view with the same addition audit
 *  detail needs: the polling layer flattens failures to a message string and
 *  drops ApiError.status, so the fetcher records a 404 itself and the page
 *  can render its dedicated empty state instead of a generic error. */
export function useInsightView<T>(path: string | null): InsightViewState<T> {
  const [isNotFound, setIsNotFound] = useState(false);

  useEffect(() => {
    setIsNotFound(false);
  }, [path]);

  const fetcher = useCallback(async (): Promise<T> => {
    try {
      return await fetchJson<T>(path ?? '');
    } catch (cause: unknown) {
      if (cause instanceof ApiError && cause.status === 404) {
        setIsNotFound(true);
      }
      throw cause;
    }
  }, [path]);

  const polling = usePolling<T>(fetcher, 0, {
    enabled: path !== null,
    key: path ?? 'none',
  });
  return { ...polling, isNotFound };
}
