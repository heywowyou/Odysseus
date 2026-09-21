/** Issue #388: initial outreach needs the qualifying audit's client report.
 *
 * One Full Scan is the evidence for everything downstream (plan 050, trade-off
 * 91): audit, French analysis, French report, then the outreach preview and
 * the first email. Since Plan 067 French is the canonical report and English
 * an optional later attachment, so only the French report decides readiness;
 * an operator-finalized French report counts, being that language's newest
 * row. Qualification only asks whether the website evidence is
 * complete; this asks whether the reports built from it are ready. Readiness
 * reads the reports that exist, not job statuses, so a needs-input stop, a
 * writing or PDF failure, a renormalization that left the reports stale, and
 * an audit that never had reports all resolve through one rule. Job rows only
 * name the reason, so the dashboard can point at the right remedy, which is
 * always regeneration from stored evidence, never a rescan.
 *
 * Pure. The To do derivation, the outreach guard, the preview store and the
 * draft runtime all call it, directly or through loadOutreachReportReadiness,
 * so none of them can drift from the others. */

import type { Connection } from 'mongoose';
import type { FindingsProvenance } from '@odysseus/core';
import { createAuditModel } from './schemas/audit.schema.js';
import { createJobModel, type JobStatus } from './schemas/job.schema.js';
import { createReportModel } from './schemas/report.schema.js';

export type OutreachReportNotReadyReason = 'needs-input' | 'failed' | 'stale' | 'missing';

export type OutreachReportReadiness =
  { state: 'ready' } | { state: 'not-ready'; reason: OutreachReportNotReadyReason };

export interface ReadinessAudit {
  auditId: string;
  startedAt: Date | string;
  findingsProvenance?: Partial<FindingsProvenance>;
}

export interface ReadinessReport {
  auditId: string;
  language: string;
  generatedAt: Date | string;
  findingsProvenance?: Partial<FindingsProvenance>;
}

export interface ReadinessJob {
  auditId?: string;
  status?: JobStatus;
  createdAt: Date | string;
}

/** Same freshness test the audit page applies before serving a PDF and that
 *  reconcileFailedAuditJobs uses to call a failed job done. */
export function findingsProvenanceMatches(
  a: Partial<FindingsProvenance> | undefined,
  b: Partial<FindingsProvenance> | undefined,
): boolean {
  return (
    a?.findingsDigest !== undefined &&
    b?.findingsDigest !== undefined &&
    a.findingsSchemaVersion === b.findingsSchemaVersion &&
    a.normalizationFingerprint === b.normalizationFingerprint &&
    a.findingsDigest === b.findingsDigest
  );
}

function asTime(value: Date | string): number {
  return new Date(value).getTime();
}

function newestFrenchReport(
  reports: readonly ReadinessReport[],
  auditId: string,
): ReadinessReport | undefined {
  let newest: ReadinessReport | undefined;
  for (const report of reports) {
    if (report.auditId !== auditId || report.language !== 'fr') continue;
    if (newest === undefined || asTime(report.generatedAt) > asTime(newest.generatedAt)) {
      newest = report;
    }
  }
  return newest;
}

/**
 * `jobs` are the prospect's job rows (any status). A needs-input job still
 * blocks when it stopped on this audit or is a newer run the operator has not
 * resolved (issue #378); one older than the audit belongs to a superseded run.
 * Otherwise the newest French report must exist and carry the audit's current
 * findings provenance. English, present or not, current or not, never blocks.
 */
export function resolveOutreachReportReadiness(
  audit: ReadinessAudit,
  reports: readonly ReadinessReport[],
  jobs: readonly ReadinessJob[],
): OutreachReportReadiness {
  const blockedOnInput = jobs.some(
    (job) =>
      job.status === 'needs-input' &&
      (job.auditId === audit.auditId || asTime(job.createdAt) >= asTime(audit.startedAt)),
  );
  if (blockedOnInput) return { state: 'not-ready', reason: 'needs-input' };

  const fr = newestFrenchReport(reports, audit.auditId);
  if (
    fr !== undefined &&
    findingsProvenanceMatches(fr.findingsProvenance, audit.findingsProvenance)
  ) {
    return { state: 'ready' };
  }
  if (jobs.some((job) => job.status === 'failed' && job.auditId === audit.auditId)) {
    return { state: 'not-ready', reason: 'failed' };
  }
  // Stale: a French report exists but was built from findings the audit no
  // longer carries. Missing: no French report at all.
  return { state: 'not-ready', reason: fr === undefined ? 'missing' : 'stale' };
}

/** Bounded report projection shared by every loader of readiness. */
export const READINESS_REPORT_PROJECTION = {
  _id: 0,
  auditId: 1,
  language: 1,
  generatedAt: 1,
  findingsProvenance: 1,
} as const;

/** Issue #389: the audits, among `auditIds`, whose client reports are not
 *  ready (missing, or built from findings the audit no longer carries). The
 *  Audits list reads it so a completed scan whose later report production
 *  failed reads as a report issue, the same fact To do shows. An audit
 *  without findings provenance predates the rule and is never flagged. */
export async function findAuditsWithUnreadyReports(
  connection: Connection,
  auditIds: readonly string[],
): Promise<Set<string>> {
  if (auditIds.length === 0) return new Set();
  const [audits, reports] = await Promise.all([
    createAuditModel(connection)
      .find({ auditId: { $in: auditIds }, 'findingsProvenance.findingsDigest': { $exists: true } })
      .select({ _id: 0, auditId: 1, startedAt: 1, findingsProvenance: 1 })
      .lean<ReadinessAudit[]>(),
    createReportModel(connection)
      .find({ auditId: { $in: auditIds } })
      .select(READINESS_REPORT_PROJECTION)
      .lean<ReadinessReport[]>(),
  ]);
  return new Set(
    audits
      .filter((audit) => resolveOutreachReportReadiness(audit, reports, []).state !== 'ready')
      .map((audit) => audit.auditId),
  );
}

/** Loads what one audit's readiness needs: its current provenance, its report
 *  rows and the prospect's blocking job rows. */
export async function loadOutreachReportReadiness(
  connection: Connection,
  input: { auditId: string; prospectId: string },
): Promise<OutreachReportReadiness> {
  const [audit, reports, jobs] = await Promise.all([
    createAuditModel(connection)
      .findOne({ auditId: input.auditId })
      .select({ _id: 0, auditId: 1, startedAt: 1, findingsProvenance: 1 })
      .lean<ReadinessAudit>(),
    createReportModel(connection)
      .find({ auditId: input.auditId })
      .select(READINESS_REPORT_PROJECTION)
      .lean<ReadinessReport[]>(),
    createJobModel(connection)
      .find({
        status: { $in: ['needs-input', 'failed'] },
        $or: [{ 'options.prospectId': input.prospectId }, { auditId: input.auditId }],
      })
      .select({ _id: 0, auditId: 1, status: 1, createdAt: 1 })
      .lean<ReadinessJob[]>(),
  ]);
  if (audit === null) return { state: 'not-ready', reason: 'missing' };
  return resolveOutreachReportReadiness(audit, reports, jobs);
}
