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
import { assessCrawlCoverage } from '@odysseus/core';

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

/** The facts a validated start needs, and exactly what the job options
 *  snapshot persists. No field here is optional: a scan without its cohort
 *  provenance is not creatable. */
export interface OutreachFullScanPlan {
  candidateId: string;
  domain: string;
  cohortId: string;
  scoringVersion: string;
}

export interface OutreachFullScanVersionInputs {
  qualificationVersion: string;
}

export async function planOutreachFullScan(
  connection: Connection,
  candidateId: string,
  versions: OutreachFullScanVersionInputs,
): Promise<OutreachFullScanPlan | { refused: OutreachFullScanStartRefusal }> {
  const candidate = await getHotelCandidate(connection, candidateId);
  if (candidate === null) return { refused: 'candidate-unknown' };

  const domain = candidate.ownRegistrableDomain;
  if (domain === undefined || domain === '') return { refused: 'no-own-domain' };

  // Authorization reads the candidate's own newest selected membership, not
  // the newest cohort document: later waves must never silently de-authorize
  // a hotel the operator selected and has not suppressed. The members index
  // ('members.candidateId') answers this without a collection scan.
  const CohortModel = createHotelScoreCohortModel(connection);
  const cohort = await CohortModel.findOne({
    'members.candidateId': candidateId,
    'members.state': 'selected',
  })
    .sort({ computedAt: -1 })
    .lean();
  if (cohort === null) return { refused: 'not-selected' };
  const member = cohort.members.find((entry) => entry.candidateId === candidateId);
  if (member === undefined || member.state !== 'selected') return { refused: 'not-selected' };
  if (!cohort.approved) return { refused: 'cohort-not-approved' };

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

  if (await findActiveOutreachFullScanJob(connection, candidateId)) {
    return { refused: 'already-in-flight' };
  }

  return { candidateId, domain, cohortId: cohort.cohortId, scoringVersion: cohort.scoringVersion };
}

/** The queued-or-running outreach full scan for one candidate, if any. Two
 *  concurrent scans of one prospect are always an operator mistake: the
 *  plan's volume gate is the cohort, not the queue. */
export async function findActiveOutreachFullScanJob(
  connection: Connection,
  candidateId: string,
): Promise<JobDocument | null> {
  return createJobModel(connection)
    .findOne({
      type: 'outreach-full-scan',
      status: { $in: ['queued', 'running'] },
      'options.outreachCandidateId': candidateId,
    })
    .sort({ createdAt: -1 })
    .lean<JobDocument>();
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
