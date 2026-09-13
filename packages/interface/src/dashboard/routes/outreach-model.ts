/**
 * Response types and pure display logic of the outreach surfaces: the
 * a-traiter inbox lists, suppression check, and outcomes
 * (packages/interface/src/routes/outreach.ts). Field names are the API's
 * persisted contract, not UI vocabulary; never respell them.
 *
 * Declared by value rather than imported from @odysseus/core and
 * @odysseus/store: this file describes what crosses the HTTP boundary
 * (dates arrive as ISO strings, storage internals do not exist here), and
 * the dashboard typescript project reads no workspace packages, the same
 * discipline as lib/api-types.ts.
 */

/** The list page size the outcomes page uses; the API clamps its own cap. */
export const PAGE_SIZE = 50;

export interface OutreachDraftRow {
  draftId: string;
  threadId: string;
  candidateId: string;
  /** Plan 040 slice 6 (additive IA item 2): the hotel's catalogue name,
   *  null when the candidate row no longer resolves. */
  hotelName: string | null;
  touch: number;
  language: 'fr' | 'en';
  touch1EvidenceSlot: string | null;
  hasProviderDraft: boolean;
  createdAt: string;
}

export interface OutreachDraftsPage {
  rows: OutreachDraftRow[];
  total: number;
  limit: number;
  offset: number;
}

/** Issue #15: the exact persisted text of one live draft, served by
 *  GET /api/outreach/drafts/:draftId/text. businessName is the candidate's
 *  hotel name when the candidate row still resolves, null otherwise; the
 *  dialog falls back to candidateId. Dates arrive as ISO strings, like
 *  every list row above. */
export interface OutreachDraftText {
  draftId: string;
  threadId: string;
  candidateId: string;
  businessName: string | null;
  touch: number;
  language: 'fr' | 'en';
  recipient: string;
  subject: string;
  body: string;
  createdAt: string;
}

export interface OutreachOutcomeSummary {
  total: number;
  byOutcome: Record<string, number>;
  byLostReason: Record<string, number>;
}

export interface OutcomeEventRow {
  outcomeId: string;
  threadId: string;
  candidateId: string;
  /** Same contract as OutreachDraftRow.hotelName above. */
  hotelName: string | null;
  outcome: string;
  lostReason: string | null;
  actor: string;
  recordedAt: string;
}

export interface OutcomesPage {
  summary: OutreachOutcomeSummary;
  rows: OutcomeEventRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface SuppressionCheckResult {
  suppressed: boolean;
}

/** Duplicated by value from @odysseus/core's OUTREACH_OUTCOMES rather than
 *  imported: the dashboard reads no workspace packages. The order here is
 *  the funnel's own lifecycle order, which is the order the summary
 *  renders in; unknown values coming from a newer API still render, after
 *  the known ones. */
export const OUTCOME_VALUES = [
  'no-reply',
  'reply-positive',
  'reply-not-now',
  'reply-negative',
  'opt-out',
  'call',
  'quoted',
  'won',
  'lost',
] as const;

export interface OutcomeCount {
  outcome: string;
  count: number;
}

/** Summary counts in the vocabulary's lifecycle order, zero counts dropped
 *  so an empty campaign renders an empty grid rather than nine zeros.
 *  Values outside the known vocabulary keep their count and sort last. */
export function summaryOutcomeCounts(byOutcome: Record<string, number>): OutcomeCount[] {
  const known = OUTCOME_VALUES.flatMap((outcome) => {
    const count = byOutcome[outcome];
    return count !== undefined && count > 0 ? [{ outcome, count }] : [];
  });
  const unknown = Object.keys(byOutcome)
    .filter((outcome) => !(OUTCOME_VALUES as readonly string[]).includes(outcome))
    .sort()
    .flatMap((outcome) => {
      const count = byOutcome[outcome];
      return count !== undefined ? [{ outcome, count }] : [];
    });
  return [...known, ...unknown];
}

export interface LostReasonCount {
  reason: string;
  count: number;
}

/** Lost reason counts, alphabetical so the closed vocabulary reads the same
 *  way on every load; zero counts dropped for the reason as above. */
export function summaryLostReasonCounts(byLostReason: Record<string, number>): LostReasonCount[] {
  return Object.keys(byLostReason)
    .sort()
    .flatMap((reason) => {
      const count = byLostReason[reason];
      return count !== undefined && count > 0 ? [{ reason, count }] : [];
    });
}

export interface PageState {
  /** One-based page number for display. */
  page: number;
  pages: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

/** Pagination state of one fetched page window. The page count never drops
 *  below one so the "page x of y" line reads sanely on an empty list. */
export function pageState(total: number, limit: number, offset: number): PageState {
  const pages = Math.max(1, Math.ceil(total / Math.max(limit, 1)));
  return {
    page: Math.floor(Math.max(offset, 0) / Math.max(limit, 1)) + 1,
    pages,
    hasPrevious: offset > 0,
    hasNext: offset + limit < total,
  };
}

/** Keeps the window inside the data after an action removes the last row of
 *  the last page: the offset steps back a page instead of pointing past the
 *  end, so a delete never shows a phantom empty page. */
export function clampedOffset(total: number, limit: number, offset: number): number {
  if (total <= 0 || offset <= 0) return 0;
  return Math.min(offset, Math.max(total - limit, 0));
}
