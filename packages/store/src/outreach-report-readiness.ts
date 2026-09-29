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
 * The newest French report must also be the one built from the selected
 * French analysis (issue #509). A failed regeneration can move the selected
 * pair forward and leave the older report behind; the preview refuses to
 * publish from such a report, so readiness must say "not ready" too.
 *
 * Pure. The To do derivation, the outreach guard, the preview store and the
 * draft runtime all call it, directly or through loadOutreachReportReadiness,
 * so none of them can drift from the others. */

import type { Connection } from 'mongoose';
import {
  assessCurrentPair,
  resolveSelectedAnalysisPair,
  type AnalysisRecordLike,
  type DeliverabilitySelection,
  type FindingsProvenance,
  type WritingSelection,
} from '@odysseus/core';
import { createAnalysisModel } from './schemas/analysis.schema.js';
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
  /** The analysis the report was rendered from. */
  analysisId?: string;
}

/** The analysis fields the selected-pair resolution reads. */
export type ReadinessAnalysis = AnalysisRecordLike;

/** The analysis pair the report workflow currently selects for an audit, as
 *  the report deliverability module reads it. The same resolution the preview
 *  and the report pipeline use. */
function selectedPairOf(
  selection: WritingSelection | undefined,
  analyses: readonly ReadinessAnalysis[],
): DeliverabilitySelection {
  const resolution = resolveSelectedAnalysisPair(selection, analyses);
  return resolution.kind === 'none' ? { kind: 'none' } : resolution;
}

export interface ReadinessJob {
  auditId?: string;
  status?: JobStatus;
  createdAt: Date | string;
}

function asTime(value: Date | string): number {
  return new Date(value).getTime();
}

function newestReport(
  reports: readonly ReadinessReport[],
  auditId: string,
  language: 'fr' | 'en',
): ReadinessReport | undefined {
  let newest: ReadinessReport | undefined;
  for (const report of reports) {
    if (report.auditId !== auditId || report.language !== language) continue;
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
 * Otherwise the French report must be current in the report deliverability
 * module's sense (issue #567): the newest French report was rendered from the
 * selected French analysis, and both carry the audit's findings provenance,
 * which fails closed when missing. English, present or not, current or not,
 * never blocks.
 */
export function resolveOutreachReportReadiness(
  audit: ReadinessAudit,
  reports: readonly ReadinessReport[],
  jobs: readonly ReadinessJob[],
  selection: DeliverabilitySelection,
): OutreachReportReadiness {
  const blockedOnInput = jobs.some(
    (job) =>
      job.status === 'needs-input' &&
      (job.auditId === audit.auditId || asTime(job.createdAt) >= asTime(audit.startedAt)),
  );
  if (blockedOnInput) return { state: 'not-ready', reason: 'needs-input' };

  const fr = newestReport(reports, audit.auditId, 'fr');
  const verdict = assessCurrentPair({
    auditFindings: audit.findingsProvenance,
    selection,
    fr: fr ?? null,
    en: null,
  });
  if (verdict.current) return { state: 'ready' };
  if (jobs.some((job) => job.status === 'failed' && job.auditId === audit.auditId)) {
    return { state: 'not-ready', reason: 'failed' };
  }
  // Stale: a French report exists but was built from findings the audit no
  // longer carries, or from an analysis no longer selected. Missing: no
  // French report at all.
  return { state: 'not-ready', reason: fr === undefined ? 'missing' : 'stale' };
}

/** Bounded report projection shared by every loader of readiness. */
export const READINESS_REPORT_PROJECTION = {
  _id: 0,
  auditId: 1,
  language: 1,
  generatedAt: 1,
  findingsProvenance: 1,
  analysisId: 1,
} as const;

/** Bounded analysis projection for the selected-pair resolution. */
export const READINESS_ANALYSIS_PROJECTION = {
  _id: 0,
  analysisId: 1,
  auditId: 1,
  language: 1,
  generatedAt: 1,
  findingsProvenance: 1,
  structureGeneratedAt: 1,
} as const;

/** The audit fields readiness reads, selection included. */
const READINESS_AUDIT_PROJECTION = {
  _id: 0,
  auditId: 1,
  startedAt: 1,
  findingsProvenance: 1,
  'reportPreparation.writingSelection': 1,
} as const;

export type ReadinessAuditRow = ReadinessAudit & {
  reportPreparation?: { writingSelection?: WritingSelection };
};

/** The selected analysis pair of each audit, from bulk-loaded rows. */
export function selectedAnalysisPairs(
  audits: readonly ReadinessAuditRow[],
  analyses: readonly ReadinessAnalysis[],
): Map<string, DeliverabilitySelection> {
  return new Map(
    audits.map((audit) => [
      audit.auditId,
      selectedPairOf(
        audit.reportPreparation?.writingSelection,
        analyses.filter((analysis) => analysis.auditId === audit.auditId),
      ),
    ]),
  );
}

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
  const [audits, reports, analyses] = await Promise.all([
    createAuditModel(connection)
      .find({ auditId: { $in: auditIds }, 'findingsProvenance.findingsDigest': { $exists: true } })
      .select(READINESS_AUDIT_PROJECTION)
      .lean<ReadinessAuditRow[]>(),
    createReportModel(connection)
      .find({ auditId: { $in: auditIds } })
      .select(READINESS_REPORT_PROJECTION)
      .lean<ReadinessReport[]>(),
    createAnalysisModel(connection)
      .find({ auditId: { $in: auditIds } })
      .select(READINESS_ANALYSIS_PROJECTION)
      .lean<ReadinessAnalysis[]>(),
  ]);
  const selected = selectedAnalysisPairs(audits, analyses);
  return new Set(
    audits
      .filter(
        (audit) =>
          resolveOutreachReportReadiness(
            audit,
            reports,
            [],
            selected.get(audit.auditId) ?? { kind: 'none' },
          ).state !== 'ready',
      )
      .map((audit) => audit.auditId),
  );
}

/** Loads what one audit's readiness needs: its current provenance, its report
 *  rows and the prospect's blocking job rows. */
export async function loadOutreachReportReadiness(
  connection: Connection,
  input: { auditId: string; prospectId: string },
): Promise<OutreachReportReadiness> {
  const [audit, reports, analyses, jobs] = await Promise.all([
    createAuditModel(connection)
      .findOne({ auditId: input.auditId })
      .select(READINESS_AUDIT_PROJECTION)
      .lean<ReadinessAuditRow>(),
    createReportModel(connection)
      .find({ auditId: input.auditId })
      .select(READINESS_REPORT_PROJECTION)
      .lean<ReadinessReport[]>(),
    createAnalysisModel(connection)
      .find({ auditId: input.auditId })
      .select(READINESS_ANALYSIS_PROJECTION)
      .lean<ReadinessAnalysis[]>(),
    createJobModel(connection)
      .find({
        status: { $in: ['needs-input', 'failed'] },
        $or: [{ 'options.prospectId': input.prospectId }, { auditId: input.auditId }],
      })
      .select({ _id: 0, auditId: 1, status: 1, createdAt: 1 })
      .lean<ReadinessJob[]>(),
  ]);
  if (audit === null) return { state: 'not-ready', reason: 'missing' };
  return resolveOutreachReportReadiness(
    audit,
    reports,
    jobs,
    selectedPairOf(audit.reportPreparation?.writingSelection, analyses),
  );
}
