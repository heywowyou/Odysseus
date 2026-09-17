import type { Connection } from 'mongoose';
import {
  normalizeAddressForHash,
  normalizeDomainForHash,
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
import { findSuppressionMatches } from './suppression.js';
import {
  auditDataVersionState,
  effectiveAuditScanIntent,
  isOutreachQualifyingAudit,
  type AuditDataVersionState,
  type AuditIntentSourceJob,
} from './prospect-audit-qualification.js';
import { createReportModel } from './schemas/report.schema.js';
import {
  READINESS_REPORT_PROJECTION,
  resolveOutreachReportReadiness,
  type OutreachReportReadiness,
  type ReadinessReport,
} from './outreach-report-readiness.js';

export type ProspectTodoKind =
  'draft' | 'reply' | 'follow-up' | 'first-email' | 'audit-input' | 'audit-report';

export interface ProspectTodoRow {
  kind: ProspectTodoKind;
  subject: string;
  action: string;
  prospectId: string;
  href: string;
  since: string;
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
  | 'updatedAt'
  | 'needsReview'
  | 'currentOutcome'
>;

export type ProspectWorkJob = Pick<JobDocumentFields, 'jobId' | 'createdAt'> &
  Partial<Pick<JobDocumentFields, 'auditId' | 'auditIds' | 'status' | 'type'>> & {
    options?: { prospectId?: string; scanType?: 'quick-check' | 'prospecting-audit' };
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
  suppressedDomains: ReadonlySet<string>;
  suppressedAddresses: ReadonlySet<string>;
}

export interface ProspectWorkRecommendation {
  action: ProspectWorkAction;
  href: string;
  reason?: ProspectWorkReason;
}

export interface ProspectWorkResult {
  prospectId: string;
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

const DAY_MS = 24 * 60 * 60 * 1000;
const TERMINAL_PROSPECT_STATUSES = new Set<Prospect['status']>(['won', 'lost', 'opted-out']);

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
  const ordered = [...audits].sort((left, right) => {
    const byStartedAt = asTime(right.startedAt) - asTime(left.startedAt);
    return byStartedAt !== 0 ? byStartedAt : right.auditId.localeCompare(left.auditId);
  });
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
  prospect: Prospect,
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
  prospect: Prospect,
  item: ProspectTodoRow | undefined,
  auditState: ProspectAuditQualificationState,
  websiteSuppressed: boolean,
  emailSuppressed: boolean,
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
  return {
    action: 'create-first-email',
    href: encodedProspectHref(prospect.prospectId, 'emails'),
  };
}

/** Purely derives open work from already-loaded rows. No collection access is
 * allowed here: a caller cannot quietly recalculate only one side of the hub
 * contract by adding a bespoke per-prospect query. */
export function deriveProspectWork(
  prospect: Prospect,
  sources: ProspectWorkSources,
  now = new Date(),
): ProspectWorkResult {
  const prospectAudits = sources.audits.filter((audit) => audit.prospectId === prospect.prospectId);
  const prospectDrafts = sources.drafts
    .filter((draft) => draft.prospectId === prospect.prospectId && draft.status === 'created')
    .sort((left, right) => asTime(right.createdAt) - asTime(left.createdAt));
  const thread = sources.threads.find((candidate) => candidate.prospectId === prospect.prospectId);
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
      since: new Date(thread.updatedAt).toISOString(),
    });
  }
  if (
    thread !== undefined &&
    (thread.state === 'e1-sent' || thread.state === 'e2-sent') &&
    thread.needsReview === undefined
  ) {
    const touch = thread.state === 'e1-sent' ? 1 : 2;
    const sent = thread.touches.find((candidate) => candidate.touch === touch);
    const afterDays = touch === 1 ? thread.spacing.touch2AfterDays : thread.spacing.touch3AfterDays;
    if (sent !== undefined && asTime(sent.sentAt) + afterDays * DAY_MS <= now.getTime()) {
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
  // the first email once regeneration produces a current FR+EN pair.
  const reportReadiness =
    qualification.audit === undefined
      ? undefined
      : resolveOutreachReportReadiness(qualification.audit, sources.reports, [
          ...needsInputJobs.map((job) => ({ ...job, status: 'needs-input' as const })),
          ...failedJobs.map((job) => ({ ...job, status: 'failed' as const })),
        ]);
  if (
    qualification.audit !== undefined &&
    reportReadiness !== undefined &&
    thread === undefined &&
    prospectDrafts.length === 0 &&
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

  items.sort((left, right) => asTime(right.since) - asTime(left.since));
  // Plan 050: an archived prospect is out of active work. Its audit state
  // stays visible on the detail page, but it opens no work and recommends
  // nothing until the operator restores it.
  if (prospect.archivedAt !== undefined) items.length = 0;
  const nextRecommendation =
    prospect.archivedAt !== undefined
      ? undefined
      : recommendation(prospect, items[0], qualification.state, websiteSuppressed, emailSuppressed);
  return {
    prospectId: prospect.prospectId,
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

function primaryWebsiteDomain(prospect: Prospect): string | undefined {
  return primaryWebsite(prospect.websites)?.registrableDomain;
}

function unique(values: readonly (string | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined))];
}

/**
 * Loads every source needed by the prospect work model with bounded `$in`
 * queries and narrow projections. The derivation below is deliberately the
 * only place that turns these rows into open work.
 */
export async function loadProspectWork(
  connection: Connection,
  prospects: readonly Prospect[],
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
        // Qualification reads only each page's status and HTTP code. The full
        // page manifest of every audit (Full scans have no page cap) would
        // otherwise travel on every to-do poll.
        'pages.status': 1,
        'pages.httpStatus': 1,
        'crawl.sitemapCoverage': 1,
        // Whole provenance: report readiness compares every field of it.
        findingsProvenance: 1,
      })
      .sort({ startedAt: -1, auditId: -1 })
      .lean<ProspectWorkAudit[]>(),
    createOutreachDraftModel(connection)
      .find({ prospectId: { $in: prospectIds }, status: 'created' })
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
      'options.prospectId': 1,
      'options.scanType': 1,
    })
    .sort({ createdAt: -1 })
    .lean<ProspectWorkJob[]>();

  const sourceJobs = scanJobs.filter(
    (job): job is ProspectWorkJob & AuditIntentSourceJob => job.type !== undefined,
  );
  const classifiedAudits = audits.map((audit) => {
    const scanIntent = effectiveAuditScanIntent(audit, sourceJobs);
    return scanIntent === undefined ? audit : { ...audit, scanIntent };
  });
  const needsInputJobs = scanJobs.filter((job) => job.status === 'needs-input');
  const failedJobs = scanJobs.filter((job) => job.status === 'failed');
  const reports =
    auditIds.length === 0
      ? []
      : await createReportModel(connection)
          .find({ auditId: { $in: auditIds } })
          .select(READINESS_REPORT_PROJECTION)
          .lean<ProspectWorkReport[]>();

  const sources: ProspectWorkSources = {
    audits: classifiedAudits,
    drafts,
    threads,
    needsInputJobs,
    failedJobs,
    reports,
    suppressedDomains: suppression.domains,
    suppressedAddresses: suppression.addresses,
  };
  // Grouped once, so each prospect's derivation filters its own rows instead
  // of every prospect scanning every loaded row.
  const auditsByProspect = groupByProspect(sources.audits, (audit) => audit.prospectId);
  const draftsByProspect = groupByProspect(sources.drafts, (draft) => draft.prospectId);
  const threadsByProspect = groupByProspect(sources.threads, (thread) => thread.prospectId);
  const jobsByProspect = groupByProspect(sources.needsInputJobs, (job) => job.options?.prospectId);
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
