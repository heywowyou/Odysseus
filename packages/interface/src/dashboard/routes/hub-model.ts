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

/** The seven hub tabs (plan 042 decision 6): the six campaign stages in
 *  the order the IA fixes them, plus the paid report chain as position
 *  four. 'report' is not a campaign stage - `pipelineSteps` never emits
 *  it - and the tab bar shows it only once the hotel is sold. */
export type HubStepKey =
  'fiche' | 'quick-check' | 'audit' | 'report' | 'preview' | 'emails' | 'outcome';

export const HUB_STEP_KEYS: readonly HubStepKey[] = [
  'fiche',
  'quick-check',
  'audit',
  'report',
  'preview',
  'emails',
  'outcome',
];

/** Issue #221: parses a `?tab=` query value into a HubStepKey, or null for
 *  anything else (absent, unknown, or a stale value from a build that used
 *  a different key) - the page falls back to the default tab rather than
 *  rendering an unrecognised one. */
export function parseHubStepKey(value: string | null | undefined): HubStepKey | null {
  return value != null && (HUB_STEP_KEYS as readonly string[]).includes(value)
    ? (value as HubStepKey)
    : null;
}

/** DOM ids of the hub's panels, so a deep link (or a section reference
 *  elsewhere) still lands on the right stage now that only the active
 *  tab's panel exists in the DOM. */
export const HUB_STEP_ANCHORS: Record<HubStepKey, string> = {
  fiche: 'hub-fiche',
  'quick-check': 'hub-quick-check',
  audit: 'hub-audit',
  report: 'hub-report',
  preview: 'hub-preview',
  emails: 'hub-emails',
  outcome: 'hub-outcome',
};

/** 'stale' and 'refreshing' (issue #217) are freshness-driven states, only
 *  ever produced for a step whose stage is versioned (today, quick-check):
 *  a stage whose persisted artifact exists but names an old pipeline
 *  version, or one whose candidate-scoped refresh is in flight. */
export type HubStepState = 'done' | 'active' | 'todo' | 'blocked' | 'stale' | 'refreshing';

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
      // Issue #217: never 'done' merely because a prescan record exists -
      // an older prescan generation reads as 'stale', and a candidate-scoped
      // refresh in flight reads as 'refreshing', both distinct from 'todo'
      // (never run at all).
      state: (() => {
        switch (detail.prescanFreshness.state) {
          case 'current':
            return 'done';
          case 'stale':
            return 'stale';
          case 'refreshing':
            return 'refreshing';
          case 'missing':
            return 'todo';
        }
      })(),
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

/** The ordered visible tabs (plan 045 stage 3.2, amending plan 042 decision
 *  6): the pipeline steps with the Rapport client tab inserted at position
 *  four whenever a full audit exists, replacing the old `isSold`/
 *  `reportRevealed` double gate (hub-model.ts, prospect-detail.tsx) that
 *  hid a job the operator could otherwise finish end to end. The report
 *  step is deliberately stateless (date null, no campaign state to show -
 *  the tab bar renders no state word for it). */
export function hubTabs(steps: HubStep[], hasAudit: boolean): HubStep[] {
  if (!hasAudit) return steps;
  const auditIndex = steps.findIndex((step) => step.key === 'audit');
  const report: HubStep = { key: 'report', state: 'todo', date: null };
  return [...steps.slice(0, auditIndex + 1), report, ...steps.slice(auditIndex + 1)];
}

/** One Audit tab picker entry (plan 042 slice 2): an audit identity plus
 *  the creating job's type, or the tolerance fallback derived from the
 *  singular detail field. */
export interface HubAuditChoice {
  auditId: string;
  startedAt: string;
  jobType: string | null;
}

export function auditChoices(detail: ProspectDetailResponse): HubAuditChoice[] {
  if (detail.outreachAudits !== undefined) return detail.outreachAudits;
  // A cached or fixture payload may predate the list field.
  const newest = detail.outreachAudit;
  return newest == null
    ? []
    : [{ auditId: newest.auditId, startedAt: newest.startedAt, jobType: null }];
}

/** Which audit the Audit and Rapport client tabs render (plan 042 slice
 *  3): the picked one, defaulting to the newest. The choice lives in the
 *  page so the two tabs can never disagree about which audit is open. */
export function selectedAuditId(choices: HubAuditChoice[], picked: string | null): string | null {
  return (choices.find((choice) => choice.auditId === picked) ?? choices[0])?.auditId ?? null;
}

export type HubPrimaryAction =
  | { kind: 'review' }
  | { kind: 'start-scan' }
  | { kind: 'see-progress'; jobId: string }
  | { kind: 'create-first-email' }
  | { kind: 'review-draft'; draftId: string }
  | { kind: 'prepare-follow-up' }
  | { kind: 'record-outcome' }
  | { kind: 'scan-refused'; refusal: string }
  | { kind: 'none' };

/** The one primary action for the hub header, chosen by the IA's state
 *  ladder. */
export function hubPrimaryAction(detail: ProspectDetailResponse): HubPrimaryAction {
  // 1. An identity decision gates every later stage.
  if (detail.reviewState === 'pending') return { kind: 'review' };

  // 2. A scan in flight owns the pipeline until it lands.
  if (detail.outreachScanJobId != null) {
    return { kind: 'see-progress', jobId: detail.outreachScanJobId };
  }

  // 3. The scan stage itself, when the server's plan allows it.
  if (detail.outreachScan?.canStart) return { kind: 'start-scan' };

  // 4. An audited candidate with no thread yet is ready for its first
  //    email. Plan 045 section 1.7: the single call publishes its own v2
  //    preview (superseding whatever was or wasn't live), so the hub no
  //    longer waits on a separate publish step before offering it.
  //    Issue #219: prefer the server's own actions.createFirstEmail when the
  //    payload carries it, so this button can never disagree with what
  //    POST /outreach/first-email would actually do; the outreachAudit/
  //    thread inference below stays only as a fallback for a cached or
  //    fixture payload that predates the field.
  if (
    detail.actions !== undefined
      ? detail.actions.createFirstEmail.state === 'available'
      : detail.outreachAudit != null && detail.thread === null
  ) {
    return { kind: 'create-first-email' };
  }

  // 6. A created draft waits for its review.
  const pendingDraft = detail.thread?.drafts.find((draft) => draft.status === 'created');
  if (pendingDraft !== undefined) return { kind: 'review-draft', draftId: pendingDraft.draftId };

  // 7. A sent touch with the sequence still open waits for its follow-up.
  //    Same #219 preference: server actions.createFollowUp first.
  if (
    detail.actions !== undefined
      ? detail.actions.createFollowUp.state === 'available'
      : detail.thread !== null && canGenerateFollowUp(detail.thread.state)
  ) {
    return { kind: 'prepare-follow-up' };
  }

  // 8. A reply (or a sync that flagged one) waits for its outcome. Same
  //    #219 preference: server actions.recordOutcome first.
  if (
    detail.actions !== undefined
      ? detail.actions.recordOutcome.state === 'available'
      : detail.thread !== null &&
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
