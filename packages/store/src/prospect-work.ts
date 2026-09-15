import type { Connection } from 'mongoose';
import {
  assessCrawlCoverage,
  normalizeAddressForHash,
  normalizeDomainForHash,
  NORMALIZATION_FINGERPRINT,
  type Prospect,
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

export type ProspectTodoKind = 'draft' | 'reply' | 'follow-up' | 'first-email' | 'audit-input';

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
  | 'review-draft'
  | 'record-outcome'
  | 'create-follow-up'
  | 'create-first-email'
  | 'prepare-audit'
  | 'review-prospect';

export type ProspectWorkReason =
  'suppressed' | 'no-contact' | 'no-audit' | 'audit-incomplete' | 'audit-stale';

export type ProspectAuditQualificationState = 'missing' | 'incomplete' | 'stale' | 'qualifying';

export type ProspectWorkAudit = Pick<
  AuditDocumentFields,
  | 'auditId'
  | 'prospectId'
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
>;

export type ProspectWorkJob = Pick<JobDocumentFields, 'jobId' | 'auditId' | 'createdAt'> & {
  options?: { prospectId?: string };
};

export interface ProspectWorkSources {
  audits: readonly ProspectWorkAudit[];
  drafts: readonly ProspectWorkDraft[];
  threads: readonly ProspectWorkThread[];
  needsInputJobs: readonly ProspectWorkJob[];
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
  websiteSuppressed: boolean;
  emailSuppressed: boolean;
}

export interface NewestQualifyingAuditResult {
  audit: ProspectWorkAudit | undefined;
  state: ProspectAuditQualificationState;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const TERMINAL_PROSPECT_STATUSES = new Set<Prospect['status']>(['won', 'lost', 'opted-out']);

function encodedProspectHref(prospectId: string, fragment: 'actions' | 'emails' | 'history') {
  return `/prospects/${encodeURIComponent(prospectId)}#${fragment}`;
}

function asTime(value: Date | string): number {
  return new Date(value).getTime();
}

function emailDomain(address: string): string | undefined {
  const at = address.lastIndexOf('@');
  return at <= 0 || at === address.length - 1 ? undefined : address.slice(at + 1);
}

function auditHasCurrentProvenance(audit: ProspectWorkAudit): boolean {
  return audit.findingsProvenance?.normalizationFingerprint === NORMALIZATION_FINGERPRINT;
}

function auditHasCompleteCoverage(audit: ProspectWorkAudit): boolean {
  const coverage = assessCrawlCoverage({
    pages: audit.pages,
    ...(audit.crawl.sitemapCoverage === undefined
      ? {}
      : { sitemapCoverage: audit.crawl.sitemapCoverage }),
  });
  return coverage.reasonCodes.length === 0;
}

/**
 * Selects the newest audit that is both current and complete. The input is
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
  const qualifyingAudit = ordered.find(
    (audit) => auditHasCurrentProvenance(audit) && auditHasCompleteCoverage(audit),
  );
  if (qualifyingAudit !== undefined) {
    return { audit: qualifyingAudit, state: 'qualifying' };
  }
  if (ordered.length === 0) return { audit: undefined, state: 'missing' };
  return {
    audit: undefined,
    state: ordered.some(auditHasCurrentProvenance) ? 'incomplete' : 'stale',
  };
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
  const website = prospect.websites.find((item) => item.primary) ?? prospect.websites[0];
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
          : auditState === 'incomplete'
            ? 'audit-incomplete'
            : 'audit-stale',
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
  if (thread?.state === 'replied') {
    items.push({
      kind: 'reply',
      subject: prospect.name,
      action: 'record-outcome',
      prospectId: prospect.prospectId,
      href: encodedProspectHref(prospect.prospectId, 'actions'),
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
  if (
    qualification.audit !== undefined &&
    thread === undefined &&
    prospectDrafts.length === 0 &&
    prospect.emails.length > 0 &&
    !websiteSuppressed &&
    !emailSuppressed
  ) {
    items.push({
      kind: 'first-email',
      subject: prospect.name,
      action: 'create-first-email',
      prospectId: prospect.prospectId,
      href: encodedProspectHref(prospect.prospectId, 'emails'),
      since: new Date(qualification.audit.startedAt).toISOString(),
    });
  }

  items.sort((left, right) => asTime(right.since) - asTime(left.since));
  const nextRecommendation = recommendation(
    prospect,
    items[0],
    qualification.state,
    websiteSuppressed,
    emailSuppressed,
  );
  return {
    prospectId: prospect.prospectId,
    items,
    ...(nextRecommendation === undefined ? {} : { recommendation: nextRecommendation }),
    auditState: qualification.state,
    ...(qualification.audit === undefined ? {} : { qualifyingAudit: qualification.audit }),
    websiteSuppressed,
    emailSuppressed,
  };
}

function primaryWebsiteDomain(prospect: Prospect): string | undefined {
  const website = prospect.websites.find((item) => item.primary) ?? prospect.websites[0];
  return website?.registrableDomain;
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

  const [audits, drafts, threads, needsInputJobs, suppression] = await Promise.all([
    createAuditModel(connection)
      .find({ prospectId: { $in: prospectIds } })
      .select({
        _id: 0,
        auditId: 1,
        prospectId: 1,
        siteUrl: 1,
        kind: 1,
        startedAt: 1,
        finishedAt: 1,
        pages: 1,
        'crawl.sitemapCoverage': 1,
        'findingsProvenance.normalizationFingerprint': 1,
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
      })
      .sort({ updatedAt: -1 })
      .lean<ProspectWorkThread[]>(),
    createJobModel(connection)
      .find({ 'options.prospectId': { $in: prospectIds }, status: 'needs-input' })
      .select({ _id: 0, jobId: 1, auditId: 1, createdAt: 1, 'options.prospectId': 1 })
      .sort({ createdAt: -1 })
      .lean<ProspectWorkJob[]>(),
    findSuppressionMatches(connection, domains, addresses),
  ]);

  const sources: ProspectWorkSources = {
    audits,
    drafts,
    threads,
    needsInputJobs,
    suppressedDomains: suppression.domains,
    suppressedAddresses: suppression.addresses,
  };
  return prospects.map((prospect) => deriveProspectWork(prospect, sources, now));
}
