import type { DashboardStrings } from '../i18n/types';

/**
 * Pure model for the prospect list and detail pages: everything the route
 * components render or send is computed here so it stays unit-testable
 * without a component tree, the same split as audits-model.ts.
 *
 * The response types describe what crosses the HTTP boundary
 * (packages/interface/src/routes/prospects.ts, backed by the store's
 * operator views). Declared by value rather than imported from
 * @odysseus/store: the dashboard typescript project reads no workspace
 * packages, the same discipline as lib/api-types.ts. Dates arrive as ISO
 * strings.
 */

export type ProspectQueue =
  'all' | 'join-review' | 'parked' | 'rejected' | 'already-engaged' | 'groups';

export const PROSPECT_QUEUES: readonly ProspectQueue[] = [
  'all',
  'join-review',
  'parked',
  'rejected',
  'already-engaged',
  'groups',
];

/** i18n table key of each queue tab; the API value is kebab-case, the
 *  strings.prospects.queues record is camelCase. */
export const QUEUE_LABEL_KEYS: Record<
  ProspectQueue,
  keyof DashboardStrings['prospects']['queues']
> = {
  all: 'all',
  'join-review': 'joinReview',
  parked: 'parked',
  rejected: 'rejected',
  'already-engaged': 'alreadyEngaged',
  groups: 'groups',
};

export type IdentityStatusFilter = '' | 'resolved' | 'needs-review' | 'ambiguous' | 'unmatched';
export type GroupStatusFilter = '' | 'independent' | 'group-member' | 'vendor-hosted' | 'unknown';
export type ReviewStateFilter = '' | 'not-required' | 'pending' | 'accepted' | 'rejected';
export type QualificationFilter =
  '' | 'qualified' | 'parked' | 'rejected' | 'already-engaged' | 'group-routed' | 'not-evaluated';

export const IDENTITY_STATUS_VALUES: readonly Exclude<IdentityStatusFilter, ''>[] = [
  'resolved',
  'needs-review',
  'ambiguous',
  'unmatched',
];
export const GROUP_STATUS_VALUES: readonly Exclude<GroupStatusFilter, ''>[] = [
  'independent',
  'group-member',
  'vendor-hosted',
  'unknown',
];
export const REVIEW_STATE_VALUES: readonly Exclude<ReviewStateFilter, ''>[] = [
  'not-required',
  'pending',
  'accepted',
  'rejected',
];
export const QUALIFICATION_VALUES: readonly Exclude<QualificationFilter, ''>[] = [
  'qualified',
  'parked',
  'rejected',
  'already-engaged',
  'group-routed',
  'not-evaluated',
];

export function isIdentityStatusValue(value: string): value is IdentityStatusFilter {
  return value === '' || (IDENTITY_STATUS_VALUES as readonly string[]).includes(value);
}
export function isGroupStatusValue(value: string): value is GroupStatusFilter {
  return value === '' || (GROUP_STATUS_VALUES as readonly string[]).includes(value);
}
export function isReviewStateValue(value: string): value is ReviewStateFilter {
  return value === '' || (REVIEW_STATE_VALUES as readonly string[]).includes(value);
}
export function isQualificationValue(value: string): value is QualificationFilter {
  return value === '' || (QUALIFICATION_VALUES as readonly string[]).includes(value);
}

/** Controlled state of the list's filters; '' means the filter is off.
 *  `search` is the free-text box and travels as the API's `q` param. */
export interface ProspectFilterState {
  queue: ProspectQueue;
  identityStatus: IdentityStatusFilter;
  groupStatus: GroupStatusFilter;
  reviewState: ReviewStateFilter;
  qualificationOutcome: QualificationFilter;
  search: string;
}

export function createEmptyFilters(): ProspectFilterState {
  return {
    queue: 'all',
    identityStatus: '',
    groupStatus: '',
    reviewState: '',
    qualificationOutcome: '',
    search: '',
  };
}

export const PROSPECT_PAGE_SIZE = 25;

/** Query path of GET /api/prospects for the current filters and page.
 *  Offset stays out when it is 0 so shared URLs stay canonical; limit is
 *  always sent so a response is self-describing. The search is trimmed so
 *  whitespace typed into the box never reaches the API as a constraint. */
export function buildProspectsPath(filters: ProspectFilterState, offset: number): string {
  const params = new URLSearchParams();
  if (filters.queue !== 'all') params.set('queue', filters.queue);
  if (filters.identityStatus !== '') params.set('identityStatus', filters.identityStatus);
  if (filters.groupStatus !== '') params.set('groupStatus', filters.groupStatus);
  if (filters.reviewState !== '') params.set('reviewState', filters.reviewState);
  if (filters.qualificationOutcome !== '') {
    params.set('qualificationOutcome', filters.qualificationOutcome);
  }
  const search = filters.search.trim();
  if (search !== '') params.set('q', search);
  params.set('limit', String(PROSPECT_PAGE_SIZE));
  if (offset > 0) params.set('offset', String(offset));
  const queryString = params.toString();
  return queryString === '' ? '/api/prospects' : `/api/prospects?${queryString}`;
}

/** Offset of the last page, floored to a page boundary. A shrunken total
 *  (filters applied, rows deleted) must never leave the operator on an
 *  empty page past the end. */
export function clampOffset(total: number, limit: number, offset: number): number {
  if (total <= 0 || offset <= 0) return 0;
  const lastPageOffset = Math.floor(Math.max(total - 1, 0) / limit) * limit;
  return Math.min(offset, lastPageOffset);
}

export function totalPages(total: number, limit: number): number {
  return Math.max(1, Math.ceil(total / limit));
}

export function currentPage(offset: number, limit: number): number {
  return Math.floor(offset / limit) + 1;
}

/** One row of GET /api/prospects (the store's OperatorProspectRow). Field
 *  names are the API's, never respelled. */
export interface ProspectRow {
  candidateId: string;
  name: string;
  commune: string | null;
  postcode: string | null;
  starRating: number | null;
  identityStatus: string;
  groupStatus: string;
  campaignEligibility: string;
  reviewState: string;
  qualificationOutcome: string;
  qualificationReasons: string[];
  prescanStatus: string | null;
  scoringVersion: string | null;
  brokennessTotal: number | null;
  abilityTotal: number | null;
  worthy: boolean | null;
  contactState: string | null;
  threadState: string | null;
  outcome: string | null;
}

export interface ProspectListResponse {
  rows: ProspectRow[];
  total: number;
  limit: number;
  offset: number;
}

/** City column text: commune and postcode together, either alone, or empty
 *  when the catalogue knows neither. */
export function locationLabel(row: ProspectRow): string {
  if (row.commune !== null && row.postcode !== null) {
    return `${row.commune} ${row.postcode}`;
  }
  return row.commune ?? row.postcode ?? '';
}

export type BadgeTone = 'neutral' | 'accent' | 'critical' | 'serious' | 'moderate' | 'minor';

/** Review state tone: a pending decision is the queue's work item, an
 *  accepted one its good end, a rejected one settled history. */
export function reviewBadgeTone(reviewState: string): BadgeTone {
  switch (reviewState) {
    case 'pending':
      return 'accent';
    case 'accepted':
      return 'minor';
    case 'rejected':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/** Qualification tone: qualified is the good end, parked and
 *  not-evaluated still need attention, rejected and the routed outcomes
 *  are settled. */
export function qualificationBadgeTone(qualificationOutcome: string): BadgeTone {
  switch (qualificationOutcome) {
    case 'qualified':
      return 'minor';
    case 'parked':
      return 'serious';
    case 'not-evaluated':
      return 'accent';
    default:
      return 'neutral';
  }
}

// ---------------------------------------------------------------------------
// Prospect detail
// ---------------------------------------------------------------------------

export interface QualificationEventResponse {
  qualificationId: string;
  qualificationVersion: string;
  domain: string | null;
  outcome: string;
  reasons: string[];
  notes: string[];
  sireneStatus: string | null;
  effectifBandCode: string | null;
  evaluatedAt: string;
}

export interface ProspectDetailResponse {
  candidateId: string;
  resolutionVersion: string;
  identityKey: string;
  identityStatus: string;
  matchedOn: { kind: string; value: string } | null;
  siret: string | null;
  siren: string | null;
  name: string;
  commune: string | null;
  postcode: string | null;
  starRating: number | null;
  roomCount: number | null;
  capacity: number | null;
  campaignEligibility: string;
  groupStatus: string;
  groupDomain: string | null;
  groupSize: number | null;
  ownRegistrableDomain: string | null;
  domainProvenance: string | null;
  declaredRegistrableDomain: string | null;
  reviewState: 'not-required' | 'pending' | 'accepted' | 'rejected';
  review: {
    queuedReason: string | null;
    actor: string | null;
    reason: string | null;
    decidedAt: string | null;
  };
  qualificationOutcome: string;
  prescanStatus: string | null;
  websites: {
    raw: string;
    kind: string;
    hostname: string | null;
    registrableDomain: string | null;
    unusableReason: string | null;
  }[];
  conflicts: { kind: string; detail: string; candidateIds: string[] }[];
  sourceRefs: { source: string; sourceId: string; sourceVersion: string; ingestRunId: string }[];
  qualification: QualificationEventResponse | null;
  qualificationHistory: {
    rows: QualificationEventResponse[];
    total: number;
    limit: number;
    offset: number;
  };
  contact: {
    contactId: string;
    contactVersion: string;
    cohortId: string;
    domain: string;
    state: string;
    reason: string;
    mxStatus: string;
    sourceKind: string | null;
    validatedAt: string;
  } | null;
  thread: {
    threadId: string;
    state: string;
    currentTouch: number;
    stateEnteredAt: string;
    stateReason: string | null;
    lastSyncedAt: string | null;
  } | null;
  outcomes: {
    rows: {
      outcomeId: string;
      outcome: string;
      lostReason: string | null;
      actor: string;
      recordedAt: string;
    }[];
    total: number;
    limit: number;
    offset: number;
  };
  /** Plan 037: whether this prospect may start an outreach full scan now,
   *  computed server-side by the same fail-closed plan the start action
   *  validates. When false, refusal names the typed reason. Optional on
   *  purpose: a cached or fixture payload may predate the field, and the
   *  button simply does not render then. */
  outreachScan?: { canStart: boolean; refusal?: string };
  // prescan, evidence, score, and preview also cross the boundary; they
  // render on their own routes, which this page only links to.
}

/** Sibling pages of one prospect; the detail page links to them instead of
 *  duplicating their sections. */
export function prospectSubPages(candidateId: string): {
  key: 'prescan' | 'score' | 'evidence' | 'preview' | 'outreach';
  path: string;
}[] {
  const encoded = encodeURIComponent(candidateId);
  return [
    { key: 'prescan', path: `/prospects/${encoded}/prescan` },
    { key: 'score', path: `/prospects/${encoded}/score` },
    { key: 'evidence', path: `/prospects/${encoded}/evidence` },
    { key: 'preview', path: `/prospects/${encoded}/preview` },
    { key: 'outreach', path: `/prospects/${encoded}/outreach` },
  ];
}

/** Body of POST /api/prospects/:candidateId/review. The reason stays out:
 *  the dashboard's confirm dialogs carry no free-text field, and the
 *  server records its own surface fallback. */
export interface ProspectReviewRequest {
  action: 'accept' | 'reject';
}

export interface ProspectReviewResponse {
  candidateId: string;
  reviewState: string;
  changed: boolean;
}

// ---------------------------------------------------------------------------
// Outreach thread (prospects-scoped: single-candidate draft generation)
// ---------------------------------------------------------------------------

/** Body of GET /api/prospects/:candidateId/outreach. */
export interface OutreachThreadResponse {
  thread: { threadId: string; state: string; currentTouch: number } | null;
}

/** Shared response shape of both draft-generation actions
 *  (POST .../outreach/draft and .../outreach/follow-up): a refusal is a
 *  successful, informative outcome, not an HTTP error, so the caller reads
 *  `created`/`refusal` to decide what to tell the operator. */
export interface OutreachDraftActionResponse {
  created: boolean;
  refusal?: string;
  draftId?: string;
  threadId?: string;
}

/** Thread states that can still receive an action from this page; every
 *  other state (drafted-but-not-sent, closed) is read-only here so the
 *  operator is never invited to create a duplicate the backend would
 *  refuse anyway. */
export function canGenerateFollowUp(state: string): boolean {
  return state === 'e1-sent' || state === 'e2-sent';
}
