/**
 * Candidate-linked outreach full scans, plan 037.
 *
 * Two pure decisions live here rather than in the route or the runner:
 * whether a selected candidate may start an outreach full scan right now
 * (planOutreachFullScan), and which stored audit is the candidate's
 * current outreach evidence (resolveOutreachAuditForCandidate). Both are
 * fail-closed: every refusal has a typed reason, and an unknown situation
 * refuses rather than assumes.
 *
 * The association between a candidate and an audit is a record fact
 * (audits.outreach.candidateId), never a hostname inference. Version
 * currency is supplied by the caller: this module cannot know which
 * qualification generation is current, because that constant lives in the
 * interface package that owns the qualification pass.
 */

import type { Connection } from 'mongoose';
import type { AuditDocumentFields } from './schemas/audit.schema.js';
import { createAuditModel } from './schemas/audit.schema.js';
import { createHotelScoreCohortModel } from './schemas/score-cohort.schema.js';
import { createJobModel, type JobDocument } from './schemas/job.schema.js';
import {
  getHotelCandidate,
  getLatestHotelCandidateByOwnRegistrableDomain,
} from './hotel-candidates.js';
import { isSuppressed } from './suppression.js';
import { findActiveWaveRosterEntry } from './wave-roster.js';
import { assessCrawlCoverage, type OutreachAuthorizationSource } from '@odysseus/core';

export type OutreachFullScanStartRefusal =
  | 'candidate-unknown'
  | 'no-own-domain'
  | 'not-selected'
  | 'cohort-not-approved'
  | 'not-qualified'
  | 'qualification-not-current'
  | 'domain-mismatch'
  | 'suppressed'
  | 'already-in-flight';

/** Which record authorized this scan: the selection rule's own cohort, or
 *  the operator's wave roster (plan 041 slice B2). The formula proposes and
 *  the operator disposes, and a stored scan says which of the two it was.
 *  Re-exported from core so the audit's own outreach context and this
 *  plan's verdict never drift into two enums of the same two values. */
export type OutreachFullScanAuthorization = OutreachAuthorizationSource;

/** The facts a validated start needs, and exactly what the job options
 *  snapshot persists. No field here is optional: a scan without its cohort
 *  provenance is not creatable. A roster-authorized scan carries the cohort
 *  the operator's decision was taken against, which is why the roster entry
 *  stores one. */
export interface OutreachFullScanPlan {
  candidateId: string;
  domain: string;
  cohortId: string;
  scoringVersion: string;
  authorizedBy: OutreachFullScanAuthorization;
}

export interface OutreachFullScanVersionInputs {
  qualificationVersion: string;
}

export interface OutreachFullScanStartOptions {
  /** Set by the runner's claim-time re-check: the job being validated is
   *  already `running` when the check executes, so the in-flight search
   *  must not match the job itself. */
  excludeJobId?: string;
}

export async function planOutreachFullScan(
  connection: Connection,
  candidateId: string,
  versions: OutreachFullScanVersionInputs,
  options: OutreachFullScanStartOptions = {},
): Promise<OutreachFullScanPlan | { refused: OutreachFullScanStartRefusal }> {
  const candidate = await getHotelCandidate(connection, candidateId);
  if (candidate === null) return { refused: 'candidate-unknown' };

  const domain = candidate.ownRegistrableDomain;
  if (domain === undefined || domain === '') return { refused: 'no-own-domain' };

  const authorization = await authorizeOutreachFullScan(connection, candidateId);
  if ('refused' in authorization) return authorization;

  const qualification = candidate.qualification;
  if (qualification === undefined || qualification.outcome !== 'qualified') {
    return { refused: 'not-qualified' };
  }
  if (qualification.qualificationVersion !== versions.qualificationVersion) {
    return { refused: 'qualification-not-current' };
  }

  // Re-resolve the catalogue's current owner of the domain: a hotel that
  // renamed again, or a domain two establishments now reach, must never be
  // scanned under the old candidate's authorization.
  const currentOwner = await getLatestHotelCandidateByOwnRegistrableDomain(connection, domain);
  if (currentOwner === null || currentOwner.candidateId !== candidateId) {
    return { refused: 'domain-mismatch' };
  }

  if (await isSuppressed(connection, domain)) return { refused: 'suppressed' };

  if (await findActiveOutreachFullScanJob(connection, candidateId, options.excludeJobId)) {
    return { refused: 'already-in-flight' };
  }

  return {
    candidateId,
    domain,
    cohortId: authorization.cohortId,
    scoringVersion: authorization.scoringVersion,
    authorizedBy: authorization.authorizedBy,
  };
}

interface OutreachFullScanAuthorizationFacts {
  authorizedBy: OutreachFullScanAuthorization;
  cohortId: string;
  scoringVersion: string;
  /** The rank the authorizing record gives this hotel, when it gives one. */
  rank: number | null;
}

/**
 * Whether a record authorizes working this hotel at all, and which one.
 *
 * Two sources, checked in that order. Cohort membership reads the
 * candidate's own newest selected membership, not the newest cohort
 * document: later waves must never silently de-authorize a hotel the
 * operator selected and has not suppressed. The members index
 * ('members.candidateId') answers this without a collection scan.
 *
 * The wave roster is consulted only when cohort membership does not
 * authorize, which is what makes it additive: it can open a hotel the rule
 * ranked below the cut, and can never close one the rule selected. The
 * checks that protect the site being scanned (qualification currency,
 * current domain ownership, suppression) run after this either way, so the
 * roster widens who may be worked, never what politeness allows.
 */
async function authorizeOutreachFullScan(
  connection: Connection,
  candidateId: string,
): Promise<OutreachFullScanAuthorizationFacts | { refused: OutreachFullScanStartRefusal }> {
  const CohortModel = createHotelScoreCohortModel(connection);
  const cohort = await CohortModel.findOne({
    'members.candidateId': candidateId,
    'members.state': 'selected',
  })
    .sort({ computedAt: -1 })
    .lean();
  const member = cohort?.members.find((entry) => entry.candidateId === candidateId);
  if (cohort !== null && member !== undefined && member.state === 'selected' && cohort.approved) {
    return {
      authorizedBy: 'cohort',
      cohortId: cohort.cohortId,
      scoringVersion: cohort.scoringVersion,
      rank: member.rank,
    };
  }

  const rosterEntry = await findActiveWaveRosterEntry(connection, candidateId);
  if (rosterEntry !== null) {
    return {
      authorizedBy: 'wave-roster',
      cohortId: rosterEntry.cohortId,
      scoringVersion: rosterEntry.scoringVersion,
      rank: rosterEntry.rank,
    };
  }

  // No roster entry, so the cohort's own answer is the refusal: "selected
  // but the selection is not approved yet" is a different operator situation
  // from "not selected".
  if (cohort !== null && member !== undefined && member.state === 'selected' && !cohort.approved) {
    return { refused: 'cohort-not-approved' };
  }
  return { refused: 'not-selected' };
}

/** The queued-or-running outreach full scan for one candidate, if any. Two
 *  concurrent scans of one prospect are always an operator mistake: the
 *  plan's volume gate is the cohort, not the queue. excludeJobId omits one
 *  job from the search, which is how a claimed job re-validates itself
 *  without refusing on its own running row. */
export async function findActiveOutreachFullScanJob(
  connection: Connection,
  candidateId: string,
  excludeJobId?: string,
): Promise<JobDocument | null> {
  return createJobModel(connection)
    .findOne({
      type: 'outreach-full-scan',
      status: { $in: ['queued', 'running'] },
      'options.outreachCandidateId': candidateId,
      ...(excludeJobId === undefined ? {} : { jobId: { $ne: excludeJobId } }),
    })
    .sort({ createdAt: -1 })
    .lean<JobDocument>();
}

/** The hub's audit facts for one candidate (plan 040 slice 4): the latest
 *  stored audit's identity, plus the id of a scan still in flight. This is
 *  a summary, not the fail-closed preview gate: a summary may legitimately
 *  show an audit that preview publication would refuse, the severity
 *  totals are joined by the caller (getSeverityRollup, one indexed
 *  aggregate), and the report lifecycle stays on the audit's own endpoint
 *  where it is already computed. */
export interface OutreachAuditStatus {
  audit: { auditId: string; startedAt: Date } | null;
  runningJobId: string | null;
}

export async function getOutreachAuditStatus(
  connection: Connection,
  candidateId: string,
): Promise<OutreachAuditStatus> {
  const AuditModel = createAuditModel(connection);
  const [audit, activeJob] = await Promise.all([
    AuditModel.findOne({ 'outreach.candidateId': candidateId })
      .sort({ startedAt: -1 })
      .select({ auditId: 1, startedAt: 1 })
      .lean<{ auditId: string; startedAt: Date } | null>(),
    findActiveOutreachFullScanJob(connection, candidateId),
  ]);
  return {
    audit: audit === null ? null : { auditId: audit.auditId, startedAt: audit.startedAt },
    runningJobId: activeJob?.jobId ?? null,
  };
}

/** Plan 042 slice 2: every audit carrying the candidate's outreach
 *  provenance, newest first, for the hub's Audit tab picker. The creating
 *  job's type rides along when the job row still exists (operational job
 *  data expires; the audit does not), so the picker can name the kind of
 *  run and not just a date. An empty list, never null.
 *
 *  Plan 045 slice 1.4: also matches `hotelLink.candidateId`, so an
 *  ordinary paid or standalone audit whose site was resolved to this
 *  candidate by domain (never authorized as prospecting evidence) shows
 *  up in the same picker. Preview resolution elsewhere
 *  (resolveOutreachAuditForCandidate above) deliberately stays
 *  outreach-only: only a candidate-linked outreach scan is preview
 *  evidence, but any audit of the hotel's own site belongs in its
 *  picker. */
export interface OutreachAuditListItem {
  auditId: string;
  startedAt: Date;
  jobType: string | null;
}

export async function listOutreachAudits(
  connection: Connection,
  candidateId: string,
): Promise<OutreachAuditListItem[]> {
  const audits = await createAuditModel(connection)
    .find({
      $or: [{ 'outreach.candidateId': candidateId }, { 'hotelLink.candidateId': candidateId }],
    })
    .sort({ startedAt: -1 })
    .select({ auditId: 1, startedAt: 1 })
    .lean<{ auditId: string; startedAt: Date }[]>();
  if (audits.length === 0) return [];

  // A completed job records its audit(s) one of two ways: a full-audit or
  // outreach-full-scan job under its single `auditId`, but a `prospecting`
  // (Light audit) job under the plural `auditIds` array - one job can scan
  // several URLs. Both must be matched, or every Light-audit-linked row
  // resolves to an unknown type even though its job row exists. A job row
  // may still be gone entirely; the type is then unknown rather than
  // guessed.
  const auditIds = audits.map((audit) => audit.auditId);
  const jobs = await createJobModel(connection)
    .find({ $or: [{ auditId: { $in: auditIds } }, { auditIds: { $in: auditIds } }] })
    .select({ auditId: 1, auditIds: 1, type: 1 })
    .lean<{ auditId?: string; auditIds?: string[]; type: string }[]>();
  const typeByAuditId = new Map<string, string>();
  for (const job of jobs) {
    if (job.auditId !== undefined) typeByAuditId.set(job.auditId, job.type);
    for (const id of job.auditIds ?? []) typeByAuditId.set(id, job.type);
  }

  return audits.map((audit) => ({
    auditId: audit.auditId,
    startedAt: audit.startedAt,
    jobType: typeByAuditId.get(audit.auditId) ?? null,
  }));
}

/** Any queued-or-running browser scan of one hostname, so the route can
 *  refuse an outreach scan that would duplicate a full audit already in
 *  flight against the same site. */
export async function findActiveScanJobForHost(
  connection: Connection,
  hostname: string,
): Promise<JobDocument | null> {
  return createJobModel(connection)
    .findOne({
      type: { $in: ['full-audit', 'outreach-full-scan'] },
      status: { $in: ['queued', 'running'] },
      siteUrl: new RegExp(`^https?://(www\\.)?${escapeRegExp(hostname)}(:\\d+)?/?(\\?|#|$)`, 'i'),
    })
    .sort({ createdAt: -1 })
    .lean<JobDocument>();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export type OutreachAuditRefusal =
  | 'candidate-unknown'
  | 'no-audit'
  | 'audit-in-flight'
  | 'audit-failed'
  | 'domain-mismatch'
  | 'suppressed'
  | 'stale-provenance'
  | 'coverage-incomplete';

export type OutreachAuditResolution =
  | { state: 'resolved'; audit: AuditDocumentFields }
  | { state: 'refused'; reason: OutreachAuditRefusal };

/**
 * Resolves the candidate-linked outreach audit exactly, or refuses with a
 * typed reason. This is the one gate every later preview decision reads:
 * a preview is built from the audit this returns, never from "whatever
 * audit exists for this domain".
 */
export async function resolveOutreachAuditForCandidate(
  connection: Connection,
  candidateId: string,
): Promise<OutreachAuditResolution> {
  const candidate = await getHotelCandidate(connection, candidateId);
  if (candidate === null) return { state: 'refused', reason: 'candidate-unknown' };

  const AuditModel = createAuditModel(connection);
  const audit = await AuditModel.findOne({ 'outreach.candidateId': candidateId })
    .sort({ startedAt: -1 })
    .lean<AuditDocumentFields>();

  if (audit === null) {
    // A scan still in flight is a different situation from one that never
    // produced an audit: the dashboard shows progress for the first and a
    // failure for the second.
    const failedJob = await createJobModel(connection)
      .findOne({
        type: 'outreach-full-scan',
        status: { $in: ['failed', 'cancelled'] },
        'options.outreachCandidateId': candidateId,
      })
      .sort({ createdAt: -1 })
      .lean<JobDocument>();
    if (failedJob !== null) return { state: 'refused', reason: 'audit-failed' };
    const activeJob = await findActiveOutreachFullScanJob(connection, candidateId);
    if (activeJob !== null) return { state: 'refused', reason: 'audit-in-flight' };
    return { state: 'refused', reason: 'no-audit' };
  }

  const domain = candidate.ownRegistrableDomain;
  if (domain === undefined || domain === '') return { state: 'refused', reason: 'domain-mismatch' };
  const auditHost = new URL(audit.siteUrl).hostname.toLowerCase();
  if (auditHost !== domain.toLowerCase()) {
    return { state: 'refused', reason: 'domain-mismatch' };
  }

  if (await isSuppressed(connection, domain)) return { state: 'refused', reason: 'suppressed' };

  // Fail closed on a legacy or half-persisted audit: the exact findings the
  // preview will aggregate must be traceable to a stamped provenance.
  if (audit.findingsProvenance === undefined || audit.findingsProvenance === null) {
    return { state: 'refused', reason: 'stale-provenance' };
  }

  const assessment = assessCrawlCoverage({
    pages: audit.pages,
    ...(audit.crawl.sitemapCoverage !== undefined
      ? { sitemapCoverage: audit.crawl.sitemapCoverage }
      : {}),
  });
  if (assessment.reasonCodes.length > 0) {
    return { state: 'refused', reason: 'coverage-incomplete' };
  }

  return { state: 'resolved', audit };
}
