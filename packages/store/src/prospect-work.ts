import type { Connection } from 'mongoose';
import {
  effectiveOutreachThreadState,
  normalizeAddressForHash,
  normalizeDomainForHash,
  type OutreachThreadState,
  type Prospect,
  emailDomain,
  primaryWebsite,
} from '@odysseus/core';
import { createAuditModel, type AuditDocumentFields } from './schemas/audit.schema.js';
import { createJobModel, type JobDocumentFields } from './schemas/job.schema.js';
import {
  createOutreachDraftModel,
  type OutreachDraftDocument,
} from './schemas/outreach-draft.schema.js';
import {
  createOutreachThreadModel,
  type OutreachThreadDocument,
} from './schemas/outreach-thread.schema.js';
import { followUpDueAt } from './outreach-threads.js';
import { findSuppressionMatches } from './suppression.js';
import {
  auditDataVersionState,
  effectiveAuditScanIntent,
  hasOutreachEligibleScanIntent,
  isOutreachQualifyingAudit,
  type AuditDataVersionState,
  type AuditIntentSourceJob,
} from './prospect-audit-qualification.js';
import { createReportModel } from './schemas/report.schema.js';
import { displayJobIntent } from './scan-intents.js';
import {
  READINESS_ANALYSIS_PROJECTION,
  READINESS_REPORT_PROJECTION,
  resolveOutreachReportReadiness,
  selectedFrenchAnalysisIds,
  type OutreachReportReadiness,
  type ReadinessAnalysis,
  type ReadinessAuditRow,
  type ReadinessReport,
} from './outreach-report-readiness.js';
import { createAnalysisModel } from './schemas/analysis.schema.js';
import { listNewestReportQualityRuns, type NewestReportQualityRun } from './report-quality.js';

export type ProspectTodoKind =
  | 'draft'
  | 'reply'
  | 'follow-up'
  | 'first-email'
  | 'audit-input'
  | 'audit-report'
  | 'report-quality-review';

export const PROSPECT_TODO_KINDS = [
  'draft',
  'reply',
  'follow-up',
  'first-email',
  'audit-input',
  'audit-report',
  'report-quality-review',
] as const satisfies readonly ProspectTodoKind[];

/** Plan 060 §8: severity of a human-attention row. Kept as a literal union
 *  here because the store cannot import the interface package's operator
 *  contract, which owns the same closed vocabulary. */
export type ProspectAttentionSeverity = 'action-required' | 'blocking';

export interface ProspectTodoRow {
  kind: ProspectTodoKind;
  subject: string;
  action: string;
  prospectId: string;
  href: string;
  since: string;
  /** Plan 060 §8 attention fields, present only on rows derived from the
   *  human-attention contract: a stable condition id, the severity, the
   *  audit subject, the closed reason code and the condition's last
   *  update. Classic prospect-work rows leave them undefined. */
  attentionId?: string;
  severity?: ProspectAttentionSeverity;
  auditId?: string;
  reasonCode?: string;
  updatedAt?: string;
}

export type ProspectWorkAction =
  | 'review-audit'
  | 'regenerate-report'
  | 'review-draft'
  | 'record-outcome'
  | 'create-follow-up'
  | 'create-first-email'
  | 'prepare-audit'
  | 'review-prospect';

export type ProspectWorkReason =
  'suppressed' | 'no-contact' | 'no-audit' | 'audit-not-outreach-grade' | 'audit-incomplete';

export type ProspectAuditQualificationState =
  'missing' | 'not-outreach-grade' | 'incomplete' | 'qualifying';

export type ProspectWorkAudit = Pick<
  AuditDocumentFields,
  | 'auditId'
  | 'prospectId'
  | 'scanIntent'
  | 'siteUrl'
  | 'kind'
  | 'startedAt'
  | 'finishedAt'
  | 'pages'
  | 'crawl'
  | 'findingsProvenance'
>;

/** The prospect fields the work derivation reads (issue #514): the To-do
 *  poll loads every active prospect, so it reads only these. */
export type ProspectWorkProspect = Pick<
  Prospect,
  'prospectId' | 'name' | 'status' | 'archivedAt' | 'websites' | 'emails'
>;

export const PROSPECT_WORK_PROJECTION = {
  _id: 0,
  prospectId: 1,
  name: 1,
  status: 1,
  archivedAt: 1,
  websites: 1,
  emails: 1,
} as const;

export type ProspectWorkDraft = Pick<
  OutreachDraftDocument,
  'draftId' | 'prospectId' | 'threadId' | 'touch' | 'status' | 'createdAt' | 'providerDraftId'
>;

export type ProspectWorkThread = Pick<
  OutreachThreadDocument,
  | 'threadId'
  | 'prospectId'
  | 'state'
  | 'currentTouch'
  | 'touches'
  | 'spacing'
  | 'stateEnteredAt'
  | 'updatedAt'
  | 'needsReview'
  | 'currentOutcome'
>;

export type ProspectWorkJob = Pick<JobDocumentFields, 'jobId' | 'createdAt'> &
  Partial<Pick<JobDocumentFields, 'auditId' | 'auditIds' | 'status' | 'type'>> & {
    options?: { prospectId?: string; scanType?: 'quick-check' | 'prospecting-audit' };
    phase?: string;
  };

export type ProspectWorkReport = ReadinessReport;

export interface ProspectWorkSources {
  audits: readonly ProspectWorkAudit[];
  drafts: readonly ProspectWorkDraft[];
  threads: readonly ProspectWorkThread[];
  needsInputJobs: readonly ProspectWorkJob[];
  /** Issue #388: failed jobs linked to the prospect's audits. They only name
   *  why reports are not ready; they never decide readiness on their own. */
  failedJobs: readonly ProspectWorkJob[];
  /** Report rows of the prospect's audits (readiness projection only). */
  reports: readonly ProspectWorkReport[];
  /** Issue #509: the selected French analysis of each audit, by auditId
   *  (null: no usable selection). Readiness requires the newest French
   *  report to come from it; absent entries skip that check. */
  selectedFrAnalyses?: ReadonlyMap<string, string | null>;
  /** Plan 060 §7.1: the newest Plan-058 quality run of each of the
   *  prospect's audits, whatever its state, so the derivation can prove
   *  which run — if any — genuinely needs an operator review. */
  qualityRuns?: readonly NewestReportQualityRun[];
  /** Issue #390: queued or running scans linked to the prospect. A running
   *  scan replaces the prepare-audit recommendation. */
  activeJobs?: readonly ProspectWorkJob[];
  suppressedDomains: ReadonlySet<string>;
  suppressedAddresses: ReadonlySet<string>;
}

export interface ProspectWorkRecommendation {
  action: ProspectWorkAction;
  href: string;
  reason?: ProspectWorkReason;
}

/** Issue #390: the prospect's newest queued or running scan. */
export interface ProspectWorkActiveScan {
  jobId: string;
  status: 'queued' | 'running';
  scanIntent?: string;
  phase?: string;
}

export interface ProspectWorkResult {
  prospectId: string;
  activeScan?: ProspectWorkActiveScan;
  items: ProspectTodoRow[];
  recommendation?: ProspectWorkRecommendation;
  auditState: ProspectAuditQualificationState;
  qualifyingAudit?: ProspectWorkAudit;
  /** Advisory only; present with a qualifying audit. Never open work. */
  dataVersionState?: AuditDataVersionState;
  /** Issue #388: present with a qualifying audit. Initial outreach waits
   *  until it is ready. */
  reportReadiness?: OutreachReportReadiness;
  websiteSuppressed: boolean;
  emailSuppressed: boolean;
}

export type NewestQualifyingAuditResult =
  | {
      audit: ProspectWorkAudit;
      state: 'qualifying';
      dataVersionState: AuditDataVersionState;
    }
  | {
      audit: undefined;
      state: Exclude<ProspectAuditQualificationState, 'qualifying'>;
    };

const TERMINAL_PROSPECT_STATUSES = new Set<Prospect['status']>(['won', 'lost', 'opted-out']);

/** The one closed reason the report-quality attention kind carries today:
 *  the Plan-058 authority stopped the run for an operator review. */
const QUALITY_RUN_REVIEW_REASON = 'quality-run-needs-operator-review';

function encodedProspectHref(
  prospectId: string,
  fragment: 'actions' | 'emails' | 'history' | 'outcome',
) {
  return `/prospects/${encodeURIComponent(prospectId)}#${fragment}`;
}

function asTime(value: Date | string): number {
  return new Date(value).getTime();
}

/**
 * Selects the newest audit with an eligible purpose and complete coverage,
 * whatever normalization version produced its findings. The input is
 * deliberately an array rather than a database cursor so guards, previews,
 * drafts, and the To-do derivation all make the same decision.
 */
export function selectNewestQualifyingAudit(
  audits: readonly ProspectWorkAudit[],
): NewestQualifyingAuditResult {
  const ordered = [...audits].sort(newestFirst);
  const qualifyingAudit = ordered.find((audit) => isOutreachQualifyingAudit(audit));
  if (qualifyingAudit !== undefined) {
    return {
      audit: qualifyingAudit,
      state: 'qualifying',
      dataVersionState: auditDataVersionState(qualifyingAudit),
    };
  }
  if (ordered.length === 0) return { audit: undefined, state: 'missing' };
  // A quick check is finished work of the wrong kind, not a broken audit:
  // it never covers enough of the site to support outreach.
  const onlyQuickChecks = ordered.every((audit) => audit.scanIntent === 'quick-check');
  return { audit: undefined, state: onlyQuickChecks ? 'not-outreach-grade' : 'incomplete' };
}

function suppressedDomainSet(values: ReadonlySet<string>): Set<string> {
  return new Set([...values].map((value) => normalizeDomainForHash(value)));
}

function suppressedAddressSet(values: ReadonlySet<string>): Set<string> {
  return new Set([...values].map((value) => normalizeAddressForHash(value)));
}

function prospectContactSuppression(
  prospect: ProspectWorkProspect,
  sources: ProspectWorkSources,
): { websiteSuppressed: boolean; emailSuppressed: boolean } {
  const domains = suppressedDomainSet(sources.suppressedDomains);
  const addresses = suppressedAddressSet(sources.suppressedAddresses);
  const website = primaryWebsite(prospect.websites);
  const websiteSuppressed =
    website !== undefined && domains.has(normalizeDomainForHash(website.registrableDomain));
  const emailSuppressed = prospect.emails.some((email) => {
    const domain = emailDomain(email.address);
    return (
      addresses.has(normalizeAddressForHash(email.address)) ||
      (domain !== undefined && domains.has(normalizeDomainForHash(domain)))
    );
  });
  return { websiteSuppressed, emailSuppressed };
}

function recommendation(
  prospect: ProspectWorkProspect,
  item: ProspectTodoRow | undefined,
  auditState: ProspectAuditQualificationState,
  websiteSuppressed: boolean,
  emailSuppressed: boolean,
  scanActive = false,
  threadState?: OutreachThreadState,
): ProspectWorkRecommendation | undefined {
  if (TERMINAL_PROSPECT_STATUSES.has(prospect.status)) return undefined;
  if (item !== undefined) {
    return { action: item.action as ProspectWorkAction, href: item.href };
  }
  if (websiteSuppressed || emailSuppressed) {
    return {
      action: 'review-prospect',
      href: encodedProspectHref(prospect.prospectId, 'actions'),
      reason: 'suppressed',
    };
  }
  if (auditState !== 'qualifying') {
    // Issue #390: the scan that would prepare the audit is already under way.
    if (scanActive) return undefined;
    return {
      action: 'prepare-audit',
      href: encodedProspectHref(prospect.prospectId, 'actions'),
      reason:
        auditState === 'missing'
          ? 'no-audit'
          : auditState === 'not-outreach-grade'
            ? 'audit-not-outreach-grade'
            : 'audit-incomplete',
    };
  }
  if (prospect.emails.length === 0) {
    return {
      action: 'review-prospect',
      href: encodedProspectHref(prospect.prospectId, 'actions'),
      reason: 'no-contact',
    };
  }
  // A thread past `open` already carries or awaits a first email; its next
  // step, if any, is a work row (draft, follow-up, reply), never a new one.
  if (threadState !== undefined && threadState !== 'open') return undefined;
  return {
    action: 'create-first-email',
    href: encodedProspectHref(prospect.prospectId, 'emails'),
  };
}

/** Purely derives open work from already-loaded rows. No collection access is
 * allowed here: a caller cannot quietly recalculate only one side of the hub
 * contract by adding a bespoke per-prospect query. */
export function deriveProspectWork(
  prospect: ProspectWorkProspect,
  sources: ProspectWorkSources,
  now = new Date(),
): ProspectWorkResult {
  const prospectAudits = sources.audits.filter((audit) => audit.prospectId === prospect.prospectId);
  const liveDrafts = sources.drafts.filter(
    (draft) =>
      draft.prospectId === prospect.prospectId &&
      (draft.status === 'created' || draft.status === 'mailbox-delete-pending'),
  );
  const prospectDrafts = liveDrafts
    .filter((draft) => draft.status === 'created')
    .sort((left, right) => asTime(right.createdAt) - asTime(left.createdAt));
  const thread = sources.threads.find((candidate) => candidate.prospectId === prospect.prospectId);
  // A drafted touch whose draft was discarded is due again, exactly as the
  // outreach guard and the draft runtime read it.
  const threadState =
    thread === undefined
      ? undefined
      : effectiveOutreachThreadState(
          thread.state,
          liveDrafts.map((draft) => draft.touch),
        );
  const needsInputJobs = sources.needsInputJobs.filter(
    (job) => job.options?.prospectId === prospect.prospectId,
  );
  const prospectAuditIds = new Set(prospectAudits.map((audit) => audit.auditId));
  const failedJobs = sources.failedJobs.filter(
    (job) =>
      job.options?.prospectId === prospect.prospectId ||
      (job.auditId !== undefined && prospectAuditIds.has(job.auditId)),
  );
  const qualification = selectNewestQualifyingAudit(prospectAudits);
  const activeJob = (sources.activeJobs ?? [])
    .filter(
      (job) =>
        job.options?.prospectId === prospect.prospectId &&
        (job.status === 'queued' || job.status === 'running'),
    )
    .sort((left, right) => asTime(right.createdAt) - asTime(left.createdAt))[0];
  const activeScan: ProspectWorkActiveScan | undefined =
    activeJob === undefined
      ? undefined
      : {
          jobId: activeJob.jobId,
          status: activeJob.status as 'queued' | 'running',
          ...(activeJob.type === undefined
            ? {}
            : { scanIntent: displayJobIntent(activeJob.type, activeJob.options?.scanType) }),
          ...(activeJob.phase === undefined ? {} : { phase: activeJob.phase }),
        };
  const { websiteSuppressed, emailSuppressed } = prospectContactSuppression(prospect, sources);
  const items: ProspectTodoRow[] = [];

  for (const job of needsInputJobs) {
    items.push({
      kind: 'audit-input',
      subject: prospect.name,
      action: 'review-audit',
      prospectId: prospect.prospectId,
      href:
        job.auditId === undefined
          ? encodedProspectHref(prospect.prospectId, 'history')
          : `/audits/${encodeURIComponent(job.auditId)}`,
      since: new Date(job.createdAt).toISOString(),
    });
  }
  for (const draft of prospectDrafts) {
    items.push({
      kind: 'draft',
      subject: prospect.name,
      action: 'review-draft',
      prospectId: prospect.prospectId,
      href: encodedProspectHref(prospect.prospectId, 'emails'),
      since: new Date(draft.createdAt).toISOString(),
    });
  }
  if (thread?.state === 'replied' && thread.currentOutcome === undefined) {
    items.push({
      kind: 'reply',
      subject: prospect.name,
      action: 'record-outcome',
      prospectId: prospect.prospectId,
      href: encodedProspectHref(prospect.prospectId, 'outcome'),
      // Not `updatedAt`: every mailbox sync moves it.
      since: new Date(thread.stateEnteredAt).toISOString(),
    });
  }
  if (
    thread !== undefined &&
    (threadState === 'e1-sent' || threadState === 'e2-sent') &&
    thread.needsReview === undefined
  ) {
    const touch = threadState === 'e1-sent' ? 1 : 2;
    const sent = thread.touches.find((candidate) => candidate.touch === touch);
    const dueAt = followUpDueAt({ ...thread, state: threadState });
    if (sent !== undefined && dueAt !== undefined && dueAt.getTime() <= now.getTime()) {
      items.push({
        kind: 'follow-up',
        subject: prospect.name,
        action: 'create-follow-up',
        prospectId: prospect.prospectId,
        href: encodedProspectHref(prospect.prospectId, 'emails'),
        since: new Date(sent.sentAt).toISOString(),
      });
    }
  }
  // Issues #378 and #388: ready client reports are a prerequisite of
  // initial outreach, not a parallel task. Only first-email work waits;
  // replies and follow-ups on an existing thread are unaffected. A
  // needs-input stop already has its audit-input row; any other not-ready
  // reason takes the first email's place with a report row, which becomes
  // the first email once regeneration produces a current French report.
  const reportReadiness =
    qualification.audit === undefined
      ? undefined
      : resolveOutreachReportReadiness(
          qualification.audit,
          sources.reports,
          [
            ...needsInputJobs.map((job) => ({ ...job, status: 'needs-input' as const })),
            ...failedJobs.map((job) => ({ ...job, status: 'failed' as const })),
          ],
          sources.selectedFrAnalyses?.get(qualification.audit.auditId),
        );
  if (
    qualification.audit !== undefined &&
    reportReadiness !== undefined &&
    (threadState === undefined || threadState === 'open') &&
    liveDrafts.length === 0 &&
    prospect.emails.length > 0 &&
    !websiteSuppressed &&
    !emailSuppressed
  ) {
    if (reportReadiness.state === 'ready') {
      items.push({
        kind: 'first-email',
        subject: prospect.name,
        action: 'create-first-email',
        prospectId: prospect.prospectId,
        href: encodedProspectHref(prospect.prospectId, 'emails'),
        since: new Date(qualification.audit.startedAt).toISOString(),
      });
    } else if (reportReadiness.reason !== 'needs-input') {
      items.push({
        kind: 'audit-report',
        subject: prospect.name,
        action: 'regenerate-report',
        prospectId: prospect.prospectId,
        href: `/audits/${encodeURIComponent(qualification.audit.auditId)}`,
        since: new Date(
          qualification.audit.finishedAt ?? qualification.audit.startedAt,
        ).toISOString(),
      });
    }
  }

  // Plan 060 §7.1: a quality run the Plan-058 authority stopped for an
  // operator review is attention. Every other run state — producing,
  // quality-approved, failed, promoted — opens none, and an unknown state
  // fabricates nothing (fail closed).
  for (const run of sources.qualityRuns ?? []) {
    if (run.state !== 'needs-operator-review') continue;
    if (!prospectAuditIds.has(run.auditId)) continue;
    items.push({
      kind: 'report-quality-review',
      subject: prospect.name,
      action: 'review-report',
      prospectId: prospect.prospectId,
      href: `/audits/${encodeURIComponent(run.auditId)}`,
      since: new Date(run.createdAt).toISOString(),
      attentionId: `report-quality-review:${run.auditId}:${run.qualityRunId}`,
      severity: 'action-required',
      auditId: run.auditId,
      reasonCode: QUALITY_RUN_REVIEW_REASON,
      updatedAt: new Date(run.updatedAt).toISOString(),
    });
  }

  items.sort((left, right) => asTime(right.since) - asTime(left.since));
  // Plan 050: an archived prospect is out of active work. Terminal outcomes
  // are the same boundary for outreach: an opt-out, win or loss must not keep
  // a stale draft, reply or report task alive after the status transition.
  if (prospect.archivedAt !== undefined || TERMINAL_PROSPECT_STATUSES.has(prospect.status)) {
    items.length = 0;
  }
  // Attention rows name an audit-quality decision, not the prospect's next
  // commercial action, so they never become the recommendation.
  const recommendedItem = items.find((item) => item.attentionId === undefined);
  const nextRecommendation =
    prospect.archivedAt !== undefined || TERMINAL_PROSPECT_STATUSES.has(prospect.status)
      ? undefined
      : recommendation(
          prospect,
          recommendedItem,
          qualification.state,
          websiteSuppressed,
          emailSuppressed,
          activeScan !== undefined,
          threadState,
        );
  return {
    prospectId: prospect.prospectId,
    ...(activeScan === undefined || prospect.archivedAt !== undefined ? {} : { activeScan }),
    items,
    ...(nextRecommendation === undefined ? {} : { recommendation: nextRecommendation }),
    auditState: qualification.state,
    ...(qualification.audit === undefined
      ? {}
      : {
          qualifyingAudit: qualification.audit,
          dataVersionState: qualification.dataVersionState,
        }),
    ...(reportReadiness === undefined ? {} : { reportReadiness }),
    websiteSuppressed,
    emailSuppressed,
  };
}

function primaryWebsiteDomain(prospect: ProspectWorkProspect): string | undefined {
  return primaryWebsite(prospect.websites)?.registrableDomain;
}

function unique(values: readonly (string | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined))];
}

function newestFirst(left: ProspectWorkAudit, right: ProspectWorkAudit): number {
  const byStartedAt = asTime(right.startedAt) - asTime(left.startedAt);
  return byStartedAt !== 0 ? byStartedAt : right.auditId.localeCompare(left.auditId);
}

/**
 * Issue #514: gives page arrays to exactly the audits
 * selectNewestQualifyingAudit has to look at, instead of loading every
 * audit's pages. Per prospect it walks the eligible-purpose audits newest
 * first, one batched query per step, and stops at the first with complete
 * coverage; usually one step. An audit left with no pages is either older
 * than the one that qualified or of an ineligible purpose, so the selection
 * reaches the same answer as with every page loaded.
 */
async function withQualificationPages(
  connection: Connection,
  audits: ProspectWorkAudit[],
): Promise<ProspectWorkAudit[]> {
  const pagesByAuditId = new Map<string, ProspectWorkAudit['pages']>();
  const pending = [
    ...groupByProspect(
      audits.filter((audit) => hasOutreachEligibleScanIntent(audit)),
      (audit) => audit.prospectId,
    ).values(),
  ].map((candidates) => [...candidates].sort(newestFirst));
  while (pending.length > 0) {
    const batch = pending.map((candidates) => candidates[0]!);
    const rows = await createAuditModel(connection)
      .find({ auditId: { $in: batch.map((audit) => audit.auditId) } })
      .select({ _id: 0, auditId: 1, 'pages.status': 1, 'pages.httpStatus': 1 })
      .lean<Pick<ProspectWorkAudit, 'auditId' | 'pages'>[]>();
    for (const row of rows) pagesByAuditId.set(row.auditId, row.pages ?? []);
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const [candidate, ...rest] = pending[index]!;
      const pages = pagesByAuditId.get(candidate!.auditId) ?? [];
      if (isOutreachQualifyingAudit({ ...candidate!, pages }) || rest.length === 0) {
        pending.splice(index, 1);
      } else {
        pending[index] = rest;
      }
    }
  }
  return audits.map((audit) => ({ ...audit, pages: pagesByAuditId.get(audit.auditId) ?? [] }));
}

/**
 * Loads every source needed by the prospect work model with bounded `$in`
 * queries and narrow projections. The derivation below is deliberately the
 * only place that turns these rows into open work.
 */
export async function loadProspectWork(
  connection: Connection,
  prospects: readonly ProspectWorkProspect[],
  now = new Date(),
): Promise<ProspectWorkResult[]> {
  if (prospects.length === 0) return [];
  const prospectIds = unique(prospects.map((prospect) => prospect.prospectId));
  const domains = unique(
    prospects.flatMap((prospect) => [
      primaryWebsiteDomain(prospect),
      ...prospect.emails.map((email) => emailDomain(email.address)),
    ]),
  );
  const addresses = unique(
    prospects.flatMap((prospect) => prospect.emails.map((email) => email.address)),
  );

  const [audits, drafts, threads, suppression] = await Promise.all([
    createAuditModel(connection)
      .find({ prospectId: { $in: prospectIds } })
      .select({
        _id: 0,
        auditId: 1,
        prospectId: 1,
        scanIntent: 1,
        siteUrl: 1,
        kind: 1,
        startedAt: 1,
        finishedAt: 1,
        // No pages here (issue #514): qualification needs them only for the
        // few audits withQualificationPages asks about, and every audit's
        // page array (Full scans have no page cap) would otherwise travel on
        // every to-do poll.
        'crawl.sitemapCoverage': 1,
        // Whole provenance: report readiness compares every field of it.
        findingsProvenance: 1,
        // Issue #509: readiness also checks the report against the selection.
        'reportPreparation.writingSelection': 1,
      })
      .sort({ startedAt: -1, auditId: -1 })
      .lean<ProspectWorkAudit[]>(),
    createOutreachDraftModel(connection)
      .find({
        prospectId: { $in: prospectIds },
        status: { $in: ['created', 'mailbox-delete-pending'] },
      })
      .select({
        _id: 0,
        draftId: 1,
        prospectId: 1,
        threadId: 1,
        touch: 1,
        status: 1,
        createdAt: 1,
        providerDraftId: 1,
      })
      .sort({ createdAt: -1 })
      .lean<ProspectWorkDraft[]>(),
    createOutreachThreadModel(connection)
      .find({ prospectId: { $in: prospectIds } })
      .select({
        _id: 0,
        threadId: 1,
        prospectId: 1,
        state: 1,
        currentTouch: 1,
        touches: 1,
        spacing: 1,
        stateEnteredAt: 1,
        updatedAt: 1,
        needsReview: 1,
        currentOutcome: 1,
      })
      .sort({ updatedAt: -1 })
      .lean<ProspectWorkThread[]>(),
    findSuppressionMatches(connection, domains, addresses),
  ]);

  const auditIds = audits.map((audit) => audit.auditId);
  const jobScope: Record<string, unknown>[] = [{ 'options.prospectId': { $in: prospectIds } }];
  if (auditIds.length > 0) {
    jobScope.push({ auditId: { $in: auditIds } }, { auditIds: { $in: auditIds } });
  }
  const scanJobs = await createJobModel(connection)
    .find({ $or: jobScope })
    .select({
      _id: 0,
      jobId: 1,
      type: 1,
      status: 1,
      auditId: 1,
      auditIds: 1,
      createdAt: 1,
      phase: 1,
      'options.prospectId': 1,
      'options.scanType': 1,
    })
    .sort({ createdAt: -1 })
    .lean<ProspectWorkJob[]>();

  const sourceJobs = scanJobs.filter(
    (job): job is ProspectWorkJob & AuditIntentSourceJob => job.type !== undefined,
  );
  const classifiedAudits = await withQualificationPages(
    connection,
    audits.map((audit) => {
      const scanIntent = effectiveAuditScanIntent(audit, sourceJobs);
      return scanIntent === undefined ? audit : { ...audit, scanIntent };
    }),
  );
  const needsInputJobs = scanJobs.filter((job) => job.status === 'needs-input');
  const failedJobs = scanJobs.filter((job) => job.status === 'failed');
  const activeJobs = scanJobs.filter((job) => job.status === 'queued' || job.status === 'running');
  const [reports, analyses, qualityRunMap] = await Promise.all([
    auditIds.length === 0
      ? Promise.resolve([])
      : createReportModel(connection)
          .find({ auditId: { $in: auditIds } })
          .select(READINESS_REPORT_PROJECTION)
          .lean<ProspectWorkReport[]>(),
    auditIds.length === 0
      ? Promise.resolve([])
      : createAnalysisModel(connection)
          .find({ auditId: { $in: auditIds } })
          .select(READINESS_ANALYSIS_PROJECTION)
          .lean<ReadinessAnalysis[]>(),
    listNewestReportQualityRuns(connection, auditIds),
  ]);

  const sources: ProspectWorkSources = {
    audits: classifiedAudits,
    drafts,
    threads,
    needsInputJobs,
    failedJobs,
    reports,
    selectedFrAnalyses: selectedFrenchAnalysisIds(audits as readonly ReadinessAuditRow[], analyses),
    qualityRuns: [...qualityRunMap.values()],
    activeJobs,
    suppressedDomains: suppression.domains,
    suppressedAddresses: suppression.addresses,
  };
  // Grouped once, so each prospect's derivation filters its own rows instead
  // of every prospect scanning every loaded row.
  const auditsByProspect = groupByProspect(sources.audits, (audit) => audit.prospectId);
  const draftsByProspect = groupByProspect(sources.drafts, (draft) => draft.prospectId);
  const threadsByProspect = groupByProspect(sources.threads, (thread) => thread.prospectId);
  const jobsByProspect = groupByProspect(sources.needsInputJobs, (job) => job.options?.prospectId);
  const activeJobsByProspect = groupByProspect(
    sources.activeJobs ?? [],
    (job) => job.options?.prospectId,
  );
  const prospectByAudit = new Map(
    sources.audits.flatMap((audit) =>
      audit.prospectId === undefined ? [] : [[audit.auditId, audit.prospectId] as const],
    ),
  );
  const failedJobsByProspect = groupByProspect(
    sources.failedJobs,
    (job) =>
      job.options?.prospectId ??
      (job.auditId === undefined ? undefined : prospectByAudit.get(job.auditId)),
  );
  const reportsByProspect = groupByProspect(sources.reports, (report) =>
    prospectByAudit.get(report.auditId),
  );
  const qualityRunsByProspect = groupByProspect(sources.qualityRuns ?? [], (run) =>
    prospectByAudit.get(run.auditId),
  );
  return prospects.map((prospect) =>
    deriveProspectWork(
      prospect,
      {
        ...sources,
        audits: auditsByProspect.get(prospect.prospectId) ?? [],
        drafts: draftsByProspect.get(prospect.prospectId) ?? [],
        threads: threadsByProspect.get(prospect.prospectId) ?? [],
        needsInputJobs: jobsByProspect.get(prospect.prospectId) ?? [],
        failedJobs: failedJobsByProspect.get(prospect.prospectId) ?? [],
        reports: reportsByProspect.get(prospect.prospectId) ?? [],
        qualityRuns: qualityRunsByProspect.get(prospect.prospectId) ?? [],
        activeJobs: activeJobsByProspect.get(prospect.prospectId) ?? [],
      },
      now,
    ),
  );
}

function groupByProspect<T>(
  rows: readonly T[],
  prospectIdOf: (row: T) => string | undefined,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const prospectId = prospectIdOf(row);
    if (prospectId === undefined) continue;
    const group = groups.get(prospectId);
    if (group === undefined) groups.set(prospectId, [row]);
    else group.push(row);
  }
  return groups;
}
