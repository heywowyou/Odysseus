/**
 * Bounded, operator-safe view projections for the prospecting funnel,
 * milestone 9c plan 013 step 1.
 *
 * This module composes the existing collection helpers into the shapes the
 * operator interface renders. It adds no new collection and no write path:
 * routes call these helpers and never need a raw Mongoose query, for the
 * reason every sibling module gives about its own collection.
 *
 * Two constraints bind every function here.
 *
 * First, each returned shape is an explicitly picked projection, never a raw
 * document. Nothing may carry a message body or subject, an email address or
 * role address, a contact address material (`address`, `localPart`,
 * `sourceUrl`), a suppression or preview token hash, or a raw payload such as
 * a qualification's `siteFacts`. State is expressed as ids, enum states,
 * counts, booleans, and dates. The point is not that operators are untrusted;
 * it is that a view which cannot hold the data cannot leak it by accident
 * when a new field is rendered.
 *
 * Second, pagination is mandatory on every list function. A caller cannot ask
 * for "all": every list takes a `{ limit, offset }` options object, defaults
 * to 50 rows, clamps the limit at 200, and sorts with a unique tiebreaker so
 * repeated calls and offset windows never repeat or skip a row. The funnel
 * holds tens of thousands of candidates; a response that grew with the
 * catalogue would be the one unbounded query in the interface.
 *
 * Since the plan 020 split, this file is only a re-export barrel over the
 * per-family modules in ./operator-views/; new views go into the matching
 * family file, never back into this barrel.
 */

export type { OperatorViewPage, OperatorViewPageOptions } from './operator-views/shared.js';
export { listOperatorProspects } from './operator-views/prospect-list.js';
export type {
  ListOperatorProspectsOptions,
  OperatorProspectListPage,
  OperatorProspectQueue,
  OperatorProspectRow,
} from './operator-views/prospect-list.js';
export {
  getSelectionProjection,
  getSelectionVerdict,
} from './operator-views/selection-projection.js';
export type {
  SelectionCohortFacts,
  SelectionMember,
  SelectionProjection,
  SelectionSource,
  SelectionVerdict,
} from './operator-views/selection-projection.js';
export { getProspectSourceConflicts } from './operator-views/source-conflicts.js';
export type {
  OperatorSourceConflictRow,
  OperatorSourceConflictsView,
  OperatorSourceRefRow,
} from './operator-views/source-conflicts.js';
export { getProspectQualificationHistory } from './operator-views/qualification-history.js';
export type { OperatorQualificationEvent } from './operator-views/qualification-history.js';
export {
  getProspectEvidenceAssetSource,
  getProspectEvidenceView,
  getProspectPrescanView,
} from './operator-views/prescan-evidence.js';
export type {
  GetProspectEvidenceAssetSourceOptions,
  GetProspectEvidenceViewOptions,
  GetProspectPrescanViewOptions,
  OperatorEvidenceAssetSlot,
  OperatorEvidenceAssetSource,
  OperatorEvidenceAssetView,
  OperatorEvidenceSummaryView,
  OperatorEvidenceView,
  OperatorPrescanPageView,
  OperatorPrescanView,
} from './operator-views/prescan-evidence.js';
export { getProspectScoreDiffView, getProspectScoreView } from './operator-views/score-views.js';
export type {
  GetProspectScoreViewOptions,
  OperatorScoreBreakdownView,
  OperatorScoreComponentView,
  OperatorScoreDiffView,
  OperatorScoreView,
} from './operator-views/score-views.js';
export {
  getProspectContactView,
  getProspectOutcomeView,
  getProspectPreviewView,
  getProspectThreadView,
} from './operator-views/contact-preview-thread-outcome.js';
export type {
  GetProspectContactViewOptions,
  OperatorContactView,
  OperatorDraftView,
  OperatorOutcomeEventView,
  OperatorPreviewView,
  OperatorThreadView,
} from './operator-views/contact-preview-thread-outcome.js';
export {
  listOutreachReviewDrafts,
  listRepliesNeedingReview,
} from './operator-views/review-lists.js';
export type {
  OperatorReplyReviewRow,
  OperatorReviewDraftRow,
} from './operator-views/review-lists.js';
export { getOutcomeSummary, getVendorFingerprintAggregate } from './operator-views/aggregates.js';
export type { OperatorOutcomeSummary } from './operator-views/aggregates.js';
export { getOperatorProspect } from './operator-views/prospect-detail.js';
export type {
  OperatorProspectDetail,
  OperatorWebsiteCandidateView,
} from './operator-views/prospect-detail.js';
export type { ProspectFreshnessVersions } from './operator-views/freshness.js';
