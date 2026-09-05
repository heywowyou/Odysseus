/**
 * Issue #56: a full-audit job whose pipeline failed can still end up with a
 * finished audit. The job row is marked failed the moment any stage throws,
 * but the audit, both analyses and, later, a fresh bilingual report pair can
 * all come into existence afterwards through paths the queue does not run
 * (the audit detail page's report regeneration and approval endpoints, or
 * the CLI working directly on the artifacts directory). Nothing in those
 * paths writes the job row, so the dashboard keeps listing an audit that
 * shipped to the client as "failed".
 *
 * Issue #73 widened this to also cover 'needs-input' jobs: a job stopped
 * deliberately on the D8 identity-confirmation gate, not crashed, and once
 * the operator confirms the fields and regenerates both reports through
 * the same audit-detail endpoints, the fresher-report test below is
 * exactly what proves the job is genuinely done.
 *
 * This is the issue's option 1 ("advance the status when the completing
 * work succeeds"), applied where store can see it. A job is advanced only
 * when its audit is demonstrably finished by the same standard the job
 * pipeline itself completes under: reports for both languages exist and
 * their findings provenance still matches the audit's current provenance
 * (the same freshness rule the audit detail page applies before it will
 * serve or approve a PDF). Anything less leaves the row exactly as it was;
 * this function never invents completion.
 */

import type { Connection } from 'mongoose';
import type { FindingsProvenance } from '@odysseus/core';
import { createAuditModel } from './schemas/audit.schema.js';
import { createJobModel } from './schemas/job.schema.js';
import { createReportModel } from './schemas/report.schema.js';

/** Upper bound on failed jobs examined per pass, so a pathological jobs
 *  collection cannot turn startup into an unbounded scan. */
const MAX_JOBS_PER_PASS = 500;

function provenanceMatches(
  a: FindingsProvenance | undefined,
  b: FindingsProvenance | undefined,
): boolean {
  return (
    a !== undefined &&
    b !== undefined &&
    a.findingsSchemaVersion === b.findingsSchemaVersion &&
    a.normalizationFingerprint === b.normalizationFingerprint &&
    a.findingsDigest === b.findingsDigest
  );
}

/**
 * Advances every failed or needs-input full-audit job whose audit now
 * carries a current bilingual report pair to status 'complete'. The
 * original record (error text and the finishedAt stamp the stop wrote,
 * plus needsInputFields if present) is deliberately preserved: the
 * recovery is not replayed here, only the present state is corrected.
 * Only 'full-audit' jobs are considered; the other job types have
 * different completion facts and no reported defect behind them.
 *
 * Returns the number of job documents advanced.
 */
export async function reconcileFailedAuditJobs(connection: Connection): Promise<number> {
  const JobModel = createJobModel(connection);
  const AuditModel = createAuditModel(connection);
  const ReportModel = createReportModel(connection);

  const failedJobs = await JobModel.find({
    type: 'full-audit',
    status: { $in: ['failed', 'needs-input'] },
    auditId: { $exists: true },
  })
    .sort({ createdAt: -1 })
    .limit(MAX_JOBS_PER_PASS)
    .lean();

  let advanced = 0;
  for (const job of failedJobs) {
    const auditId = job.auditId;
    if (auditId === undefined) continue;

    const audit = await AuditModel.findOne({ auditId }).lean();
    if (!audit) continue;

    const fr = await ReportModel.findOne({ auditId, language: 'fr' })
      .sort({ generatedAt: -1 })
      .lean();
    const en = await ReportModel.findOne({ auditId, language: 'en' })
      .sort({ generatedAt: -1 })
      .lean();
    if (!fr || !en) continue;
    if (
      !provenanceMatches(fr.findingsProvenance, audit.findingsProvenance) ||
      !provenanceMatches(en.findingsProvenance, audit.findingsProvenance)
    ) {
      continue;
    }

    // The status guard in the filter makes the write idempotent and keeps
    // a job that turned terminal in another way between the read and this
    // write from being relabelled. Matching job.status (not a hardcoded
    // 'failed') is what lets this same guard cover both starting statuses.
    const result = await JobModel.updateOne(
      { jobId: job.jobId, status: job.status },
      { $set: { status: 'complete', phase: 'complete' } },
    );
    advanced += result.modifiedCount;
  }

  return advanced;
}
