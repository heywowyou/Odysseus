import { formatDateTime } from '../lib/format';
import type { DashboardLanguage } from '../i18n/types';
import type { DashboardStrings } from '../i18n/types';
import { previewState } from './insights-model';
import { canGenerateFollowUp } from './prospects-model';
import type { ProspectDetailResponse } from './prospects-model';

/**
 * Pure model for the hotel hub (plan 040 slice 4): the pipeline strip and
 * the state-driven primary action are computed here so the page component
 * stays presentational, the same split as audits-model.ts and
 * prospects-model.ts.
 *
 * The state ladder follows the approved IA
 * (docs/product/dashboard-ia.md, "The hub"): walk the pipeline from the
 * top, and the first stage that needs an operator decision names the
 * primary action. Exactly one primary action is visible at a time.
 */

/** The six pipeline stages, in the order the IA fixes them. */
export type HubStepKey = 'fiche' | 'quick-check' | 'audit' | 'preview' | 'emails' | 'outcome';

export const HUB_STEP_KEYS: readonly HubStepKey[] = [
  'fiche',
  'quick-check',
  'audit',
  'preview',
  'emails',
  'outcome',
];

/** DOM ids of the hub's sections, so a strip step (or the primary action)
 *  can jump to its section. */
export const HUB_STEP_ANCHORS: Record<HubStepKey, string> = {
  fiche: 'hub-fiche',
  'quick-check': 'hub-quick-check',
  audit: 'hub-audit',
  preview: 'hub-preview',
  emails: 'hub-emails',
  outcome: 'hub-outcome',
};

export type HubStepState = 'done' | 'active' | 'todo' | 'blocked';

export interface HubStep {
  key: HubStepKey;
  state: HubStepState;
  /** ISO date qualifying the state (when the stage was done or entered),
   *  or null while the stage has no date yet. */
  date: string | null;
  /** The thread state code on the Emails step, so the strip can name it
   *  the way the Emails section does. */
  threadState?: string;
}

/** One step per pipeline stage, computed from the composed detail
 *  response. A stage the prospect has not reached yet is `todo`; a stage
 *  the operator must act on is `active`; the scan stage reads `blocked`
 *  when the server's plan refused with a terminal reason. */
export function pipelineSteps(detail: ProspectDetailResponse, now: number): HubStep[] {
  const reviewPending = detail.reviewState === 'pending';
  const ficheDate =
    detail.reviewState === 'pending' || detail.review.decidedAt === null
      ? null
      : detail.review.decidedAt;

  const auditRefusal = detail.outreachScan?.canStart ? undefined : detail.outreachScan?.refusal;
  const auditState: HubStepState =
    detail.outreachScanJobId != null
      ? 'active'
      : detail.outreachAudit != null
        ? 'done'
        : auditRefusal !== undefined
          ? 'blocked'
          : 'todo';

  // A cached or fixture payload may predate the composed preview field,
  // so absence reads as undefined here; previewState stays strict.
  const preview = previewState(detail.preview ?? null, now);
  const previewState_: HubStepState =
    preview === 'live' ? 'done' : detail.outreachAudit != null ? 'active' : 'todo';

  const thread = detail.thread;
  const threadStep: HubStep = (() => {
    if (thread === null) {
      return { key: 'emails', state: preview === 'live' ? 'active' : 'todo', date: null };
    }
    const drafted = thread.state.endsWith('-drafted');
    const blocked =
      thread.state === 'opted-out' || thread.state === 'bounced' || thread.state === 'closed';
    return {
      key: 'emails',
      state: drafted ? 'active' : blocked ? 'blocked' : 'done',
      date: thread.stateEnteredAt,
      threadState: thread.state,
    };
  })();

  const outcomeState: HubStepState = (() => {
    if (thread === null) return 'todo';
    if (thread.currentOutcome !== null) return 'done';
    if (thread.state === 'replied' || thread.needsReview !== null) return 'active';
    return 'todo';
  })();

  return [
    {
      key: 'fiche',
      state: reviewPending ? 'active' : 'done',
      date: ficheDate,
    },
    {
      key: 'quick-check',
      state: detail.prescan !== null ? 'done' : 'todo',
      date: detail.prescan?.startedAt ?? null,
    },
    {
      key: 'audit',
      state: auditState,
      date: detail.outreachAudit?.startedAt ?? null,
    },
    {
      key: 'preview',
      state: previewState_,
      date: detail.preview?.publishedAt ?? null,
    },
    threadStep,
    {
      key: 'outcome',
      state: outcomeState,
      date: thread?.currentOutcome?.recordedAt ?? null,
    },
  ];
}

export type HubPrimaryAction =
  | { kind: 'review' }
  | { kind: 'start-scan' }
  | { kind: 'see-progress'; jobId: string }
  | { kind: 'publish-preview' }
  | { kind: 'create-first-email' }
  | { kind: 'review-draft'; draftId: string }
  | { kind: 'prepare-follow-up' }
  | { kind: 'record-outcome' }
  | { kind: 'scan-refused'; refusal: string }
  | { kind: 'none' };

/** The one primary action for the hub header, chosen by the IA's state
 *  ladder. `now` separates a live preview from an expired one the same
 *  way the Aperçu section does. */
export function hubPrimaryAction(detail: ProspectDetailResponse, now: number): HubPrimaryAction {
  // 1. An identity decision gates every later stage.
  if (detail.reviewState === 'pending') return { kind: 'review' };

  // 2. A scan in flight owns the pipeline until it lands.
  if (detail.outreachScanJobId != null) {
    return { kind: 'see-progress', jobId: detail.outreachScanJobId };
  }

  // 3. The scan stage itself, when the server's plan allows it.
  if (detail.outreachScan?.canStart) return { kind: 'start-scan' };

  const preview = previewState(detail.preview ?? null, now);

  // 4. An audit with no live preview waits for its publication (first
  //    publish or reissue alike: the endpoint decides).
  if (detail.outreachAudit != null && preview !== 'live') {
    return { kind: 'publish-preview' };
  }

  // 5. A live preview with no thread yet waits for its first email.
  if (preview === 'live' && detail.thread === null) return { kind: 'create-first-email' };

  // 6. A created draft waits for its review.
  const pendingDraft = detail.thread?.drafts.find((draft) => draft.status === 'created');
  if (pendingDraft !== undefined) return { kind: 'review-draft', draftId: pendingDraft.draftId };

  // 7. A sent touch with the sequence still open waits for its follow-up.
  if (detail.thread !== null && canGenerateFollowUp(detail.thread.state)) {
    return { kind: 'prepare-follow-up' };
  }

  // 8. A reply (or a sync that flagged one) waits for its outcome.
  if (
    detail.thread !== null &&
    detail.thread.currentOutcome === null &&
    (detail.thread.state === 'replied' || detail.thread.needsReview !== null)
  ) {
    return { kind: 'record-outcome' };
  }

  // 9. Nothing actionable: a terminal scan refusal is explained where the
  //    button would sit, in plain words (IA: the page must say why).
  if (detail.outreachScan != null && !detail.outreachScan.canStart && detail.outreachScan.refusal) {
    return { kind: 'scan-refused', refusal: detail.outreachScan.refusal };
  }

  return { kind: 'none' };
}

/** Plan 041 slice B1: the factual "why" shown beside a 'not-selected'
 *  refusal, read from the same selection verdict the list's wave column
 *  uses. Null for every other refusal, and null when the verdict itself is
 *  absent (a cached or fixture payload predating the field) - the refusal
 *  sentence alone still explains enough. */
export function selectionVerdictSentence(
  detail: ProspectDetailResponse,
  strings: DashboardStrings,
  language: DashboardLanguage,
): string | null {
  if (detail.outreachScan?.refusal !== 'not-selected') return null;
  const verdict = detail.selectionVerdict;
  if (verdict === undefined || verdict.cohort === null) return null;

  const score = detail.score;
  if (score === null) return strings.hub.selectionVerdict.notScored;

  return strings.hub.selectionVerdict.belowCutoff
    .replace('{ability}', String(score.ability.total))
    .replace('{abilityCutoff}', String(verdict.cohort.abilityCutoff ?? '-'))
    .replace('{brokenness}', String(score.brokenness.total))
    .replace('{brokennessCutoff}', String(verdict.cohort.brokennessCutoff ?? '-'))
    .replace('{date}', formatDateTime(verdict.cohort.computedAt, language));
}

/** Narrow slice of GET /api/audits/:auditId the hub's Audit section reads
 *  for the report stage. The full payload carries the findings; the hub
 *  deliberately does not: severity totals arrive on the prospect detail
 *  itself, and findings live on the audit page. */
export interface HubAuditReportState {
  lifecycle: 'scanned' | 'analysed' | 'rendered' | 'approved';
}
